"""DB-08 storage and concurrent auth acceptance on disposable PostgreSQL."""
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.config import get_database_connect_args, get_settings
from app.core.database import engine, get_db
from app.main import app
from app.services.auth import router as auth_router
from app.services.auth.models import OtpCode, User, utcnow
from app.services.auth.otp import hash_code
from app.services.auth.sms import SmsSendError
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

pytestmark = pytest.mark.integration
VERSIONS = Path(__file__).resolve().parents[2] / 'database/migrations/versions'
PHONE = '0551234567'
SECRET = 'db08-test-secret'


def migrate(conn, name='0009_otp_codes'):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(conn)):
        module.upgrade()


@pytest.fixture
def isolated_engine():
    schema = 'db08_' + uuid4().hex
    with engine.begin() as conn:
        conn.execute(sa.text(f'CREATE SCHEMA {schema}'))
    isolated = sa.create_engine(
        engine.url,
        connect_args={**get_database_connect_args(), 'options': f'-csearch_path={schema} -clock_timeout=5000 -cstatement_timeout=10000'},
    )
    try:
        yield isolated
    finally:
        isolated.dispose()
        with engine.begin() as conn:
            conn.execute(sa.text(f'DROP SCHEMA {schema} CASCADE'))


def test_fresh_storage_and_repeat_upgrade(isolated_engine):
    with isolated_engine.begin() as conn:
        migrate(conn)
        migrate(conn)
        inspector = sa.inspect(conn)
        columns = {c['name']: c for c in inspector.get_columns('otp_codes')}
        assert set(columns) == {'id', 'phone', 'code_hash', 'expires_at', 'attempts', 'used_at', 'created_at'}
        assert isinstance(columns['id']['type'], sa.Uuid)
        for field in ('phone', 'code_hash'):
            assert isinstance(columns[field]['type'], sa.Text)
        for field in ('expires_at', 'used_at', 'created_at'):
            assert isinstance(columns[field]['type'], sa.DateTime)
            assert not columns[field]['type'].timezone
        assert isinstance(columns['attempts']['type'], sa.Integer)
        assert columns['attempts']['default'] == '0'
        assert {k for k, v in columns.items() if v['nullable']} == {'used_at'}
        assert inspector.get_pk_constraint('otp_codes')['constrained_columns'] == ['id']
        assert inspector.get_foreign_keys('otp_codes') == []
        assert any(i['column_names'] == ['phone'] for i in inspector.get_indexes('otp_codes'))


def draft_table(conn):
    source = (VERSIONS.parents[1] / 'schema.sql').read_text()
    start = source.index('CREATE TABLE IF NOT EXISTS otp_codes (')
    conn.execute(sa.text(source[start:source.index(';', start) + 1]))


def test_adopts_draft_preserving_rows_and_adds_index(isolated_engine):
    with isolated_engine.begin() as conn:
        draft_table(conn)
        conn.execute(sa.text("INSERT INTO otp_codes (id,phone,code_hash,expires_at,created_at) "
                             "VALUES (:id,:phone,:hash,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"),
                     {'id': uuid4(), 'phone': PHONE, 'hash': hash_code(PHONE, '123456', SECRET)})
        before = conn.execute(sa.text('SELECT * FROM otp_codes')).all()
        migrate(conn)
        assert conn.execute(sa.text('SELECT * FROM otp_codes')).all() == before
        assert any(i['column_names'] == ['phone'] for i in sa.inspect(conn).get_indexes('otp_codes'))


@pytest.mark.parametrize('alter', [
    'ALTER TABLE otp_codes ALTER COLUMN attempts DROP DEFAULT',
    'ALTER TABLE otp_codes ALTER COLUMN phone DROP NOT NULL',
    'ALTER TABLE otp_codes ALTER COLUMN expires_at TYPE TIMESTAMPTZ',
    'ALTER TABLE otp_codes DROP CONSTRAINT otp_codes_pkey',
    'ALTER TABLE otp_codes ADD COLUMN unexpected TEXT',
    'ALTER TABLE otp_codes ALTER COLUMN attempts TYPE BIGINT',
    'ALTER TABLE otp_codes ADD CONSTRAINT otp_phone_unique UNIQUE (phone)',
])
def test_rejects_incompatible_draft(isolated_engine, alter):
    with isolated_engine.begin() as conn:
        draft_table(conn)
        conn.execute(sa.text(alter))
        with pytest.raises(RuntimeError, match='Reconcile'):
            migrate(conn)
        assert not any(i['name'] == 'ix_otp_codes_phone' for i in sa.inspect(conn).get_indexes('otp_codes'))


def test_phone_lock_blocks_other_connections_and_releases(isolated_engine):
    sessions = sessionmaker(bind=isolated_engine)
    with sessions() as first, sessions() as second:
        auth_router._lock_phone(first, PHONE)
        # Different phones proceed while the first transaction is open.
        auth_router._lock_phone(second, '0559999999')
        second.rollback()
        second.execute(sa.text("SET LOCAL lock_timeout = '100ms'"))
        with pytest.raises(sa.exc.OperationalError) as error:
            auth_router._lock_phone(second, PHONE)
        assert error.value.orig.sqlstate == '55P03'
        second.rollback()
        first.commit()
        auth_router._lock_phone(second, PHONE)
        second.rollback()
        auth_router._lock_phone(first, PHONE)


@pytest.fixture
def ctx(isolated_engine, monkeypatch):
    monkeypatch.setenv('SECRET_KEY', SECRET)
    monkeypatch.setenv('SMS_MODE', 'mock')
    get_settings.cache_clear()
    with isolated_engine.begin() as conn:
        migrate(conn, '0002_account_keys_and_phone')
        migrate(conn, '0003_account_preferences')
        migrate(conn)
        migrate(conn, '0013_user_token_version')  # the users table as the app maps it (logout ends tokens)
    sessions = sessionmaker(bind=isolated_engine, autoflush=False, expire_on_commit=False)

    def override_db():
        with sessions() as db:
            yield db

    codes = []
    generated = iter(['123456', '654321', '456789'])
    monkeypatch.setattr(auth_router, 'generate_code', lambda: next(generated))
    monkeypatch.setattr(auth_router, 'send_code', lambda phone, code: codes.append(code))
    app.dependency_overrides[get_db] = override_db
    try:
        yield TestClient(app), sessions, codes
    finally:
        app.dependency_overrides.pop(get_db, None)
        get_settings.cache_clear()


def request(ctx):
    return ctx[0].post('/api/v1/auth/request-code', json={'phone': PHONE})


def verify(ctx, code='123456', name='DB08'):
    return ctx[0].post('/api/v1/auth/verify', json={'phone': PHONE, 'code': code, 'name': name})


def age(ctx):
    with ctx[1]() as db:
        row = db.scalars(sa.select(OtpCode).order_by(OtpCode.created_at.desc())).first()
        row.created_at -= timedelta(seconds=61)
        db.commit()


def test_persisted_hash_attempts_consumption_and_reuse(ctx):
    assert request(ctx).status_code == 200
    with ctx[1]() as db:
        row = db.scalars(sa.select(OtpCode)).one()
        assert row.code_hash == hash_code(PHONE, '123456', SECRET)
        assert row.code_hash != '123456'
        assert row.attempts == 0 and row.used_at is None
        assert row.expires_at - row.created_at == timedelta(seconds=300)
    assert verify(ctx, '000000').status_code == 401
    with ctx[1]() as db:
        assert db.scalars(sa.select(OtpCode)).one().attempts == 1
    assert verify(ctx).status_code == 200
    with ctx[1]() as db:
        assert db.scalars(sa.select(OtpCode)).one().used_at is not None
    rejected = verify(ctx)
    assert rejected.status_code == 401 and 'token' not in rejected.json()


@pytest.mark.parametrize('offset', [0, -1])
def test_expired_code_cannot_create_account_or_token(ctx, monkeypatch, offset):
    request(ctx)
    now = utcnow()
    with ctx[1]() as db:
        db.scalars(sa.select(OtpCode)).one().expires_at = now + timedelta(seconds=offset)
        db.commit()
    monkeypatch.setattr(auth_router, 'utcnow', lambda: now)
    response = verify(ctx)
    assert response.status_code == 401
    assert response.json()['error']['code'] == 'CODE_EXPIRED'
    assert 'token' not in response.json()
    with ctx[1]() as db:
        assert db.scalars(sa.select(User)).first() is None


def test_replacement_and_failed_delivery(ctx, monkeypatch):
    request(ctx)
    age(ctx)

    def broken(phone, code):
        raise SmsSendError('test failure')

    with monkeypatch.context() as patch:
        patch.setattr(auth_router, 'send_code', broken)
        assert ctx[0].post('/api/v1/auth/resend-code', json={'phone': PHONE}).status_code == 503
    with ctx[1]() as db:
        row = db.scalars(sa.select(OtpCode)).one()
        assert row.expires_at > utcnow() and row.used_at is None
    assert ctx[0].post('/api/v1/auth/resend-code', json={'phone': PHONE}).status_code == 200
    assert ctx[2][-1] == '456789'
    rejected = verify(ctx, '123456')
    assert rejected.status_code == 401 and 'token' not in rejected.json()
    assert verify(ctx, '456789').status_code == 200


def concurrent(ctx, monkeypatch, actions):
    barrier = Barrier(len(actions))
    original = auth_router._lock_phone

    def lock(db, phone):
        barrier.wait(timeout=5)
        original(db, phone)

    with monkeypatch.context() as patch:
        patch.setattr(auth_router, '_lock_phone', lock)
        with ThreadPoolExecutor(max_workers=len(actions)) as pool:
            jobs = [pool.submit(action) for action in actions]
            return [job.result(timeout=15) for job in jobs]


@pytest.mark.parametrize('existing_account', [False, True])
def test_concurrent_verify_issues_only_one_token(ctx, monkeypatch, existing_account):
    if existing_account:
        with ctx[1]() as db:
            db.add(User(name='Existing', phone_number=PHONE))
            db.commit()
    request(ctx)
    responses = concurrent(ctx, monkeypatch, [lambda: verify(ctx), lambda: verify(ctx)])
    assert sorted(r.status_code for r in responses) == [200, 401]
    assert sum('token' in r.json() for r in responses) == 1
    with ctx[1]() as db:
        assert len(db.scalars(sa.select(User)).all()) == 1


def test_concurrent_wrong_attempts_are_not_lost(ctx, monkeypatch):
    request(ctx)
    responses = concurrent(ctx, monkeypatch, [lambda: verify(ctx, '000000')] * 5)
    assert sorted(r.status_code for r in responses) == [401, 401, 401, 401, 429]
    with ctx[1]() as db:
        assert db.scalars(sa.select(OtpCode)).one().attempts == 5
    assert verify(ctx).status_code == 429


def test_concurrent_initial_requests_send_once(ctx, monkeypatch):
    responses = concurrent(ctx, monkeypatch, [lambda: request(ctx), lambda: request(ctx)])
    assert sorted(r.status_code for r in responses) == [200, 429]
    assert len(ctx[2]) == 1


def test_concurrent_resend_and_verify(ctx, monkeypatch):
    request(ctx)
    age(ctx)
    responses = concurrent(ctx, monkeypatch, [
        lambda: ctx[0].post('/api/v1/auth/resend-code', json={'phone': PHONE}),
        lambda: verify(ctx),
    ])
    assert responses[0].status_code == 200
    assert responses[1].status_code in (200, 401)
    rejected = verify(ctx, '123456')
    assert rejected.status_code == 401 and 'token' not in rejected.json()
    assert verify(ctx, '654321').status_code == 200
