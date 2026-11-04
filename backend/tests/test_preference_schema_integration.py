"""DB-14 acceptance on PostgreSQL; isolated schemas roll back after each test."""
import importlib.util
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.database import engine
from app.services.auth.models import User
from app.services.preferences.models import Preference
from sqlalchemy.orm import Session

pytestmark = pytest.mark.integration
VERSIONS = Path(__file__).resolve().parents[2] / 'database/migrations/versions'


def revision(name):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def migrate(conn):
    with Operations.context(MigrationContext.configure(conn)):
        revision('0003_account_preferences').upgrade()


@pytest.fixture
def conn():
    with engine.connect() as connection, connection.begin():
        name = 'db14_' + uuid4().hex
        connection.execute(sa.text(f'CREATE SCHEMA {name}'))
        connection.execute(sa.text(f'SET LOCAL search_path TO {name}'))
        with Operations.context(MigrationContext.configure(connection)):
            revision('0002_account_keys_and_phone').upgrade()
        yield connection
        connection.rollback()


def user(conn):
    uid = uuid4()
    conn.execute(sa.text("INSERT INTO users VALUES (:id, 'DB14', :phone, NULL, CURRENT_TIMESTAMP)"),
                 {'id': uid, 'phone': str(uid)})
    return uid


def legacy(conn):
    conn.execute(sa.text('CREATE TABLE participants (id uuid PRIMARY KEY)'))
    conn.execute(sa.text('''CREATE TABLE preferences (
        id uuid PRIMARY KEY, user_id uuid REFERENCES users(id),
        participant_id uuid UNIQUE REFERENCES participants(id),
        liked_cuisines text, allergies text, budget_min integer, budget_max integer,
        max_distance_km integer, seating_needs text)'''))


def insert(conn, uid, **values):
    params = {'id': uuid4(), 'user_id': uid, **values}
    names = ', '.join(params)
    placeholders = ', '.join(':' + name for name in params)
    conn.execute(sa.text(f'INSERT INTO preferences ({names}) VALUES ({placeholders})'), params)
    return params['id']


def test_clean_ownership_and_constraints(conn):
    migrate(conn)
    uid = user(conn)
    insert(conn, uid, budget_min=0, budget_max=2000000000, max_distance_km=Decimal('0.25'))
    for owner in (uid, None, uuid4()):
        with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
            insert(conn, owner)
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
        conn.execute(sa.text('DELETE FROM users WHERE id=:id'), {'id': uid})
    assert 'participants' not in sa.inspect(conn).get_table_names()


@pytest.mark.parametrize('values', [
    {'budget_min': -1}, {'budget_max': -1}, {'budget_min': 20, 'budget_max': 10},
    {'max_distance_km': 0}, {'max_distance_km': -1},
    {'max_distance_km': Decimal('NaN')}, {'max_distance_km': Decimal('Infinity')},
    {'max_distance_km': Decimal('-Infinity')},
])
def test_invalid_numbers_rejected(conn, values):
    migrate(conn)
    uid = user(conn)
    with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
        insert(conn, uid, **values)


def test_optional_and_equal_budgets(conn):
    migrate(conn)
    for values in ({}, {'budget_min': 0}, {'budget_max': 0}, {'budget_min': 0, 'budget_max': 0}):
        insert(conn, user(conn), **values)


def test_legacy_preserves_account_and_participant_data(conn):
    legacy(conn)
    uid, participant = user(conn), uuid4()
    conn.execute(sa.text('INSERT INTO participants VALUES (:id)'), {'id': participant})
    account_id = insert(conn, uid, liked_cuisines='["saudi_gulf", "grill"]', allergies='{}', max_distance_km=10)
    participant_id = insert(conn, None, participant_id=participant, liked_cuisines='{"italian","a,b"}',
                            allergies=None, budget_min=-1)
    migrate(conn)
    rows = conn.execute(sa.text('SELECT id,user_id,participant_id,liked_cuisines,allergies,budget_min,max_distance_km FROM preferences')).mappings().all()
    by_id = {r['id']: r for r in rows}
    assert by_id[account_id]['liked_cuisines'] == ['saudi_gulf', 'grill']
    assert by_id[account_id]['allergies'] == []
    assert by_id[account_id]['max_distance_km'] == Decimal(10)
    assert by_id[participant_id]['liked_cuisines'] == ['italian', 'a,b']
    assert by_id[participant_id]['allergies'] is None
    assert by_id[participant_id]['budget_min'] == -1
    assert by_id[participant_id]['participant_id'] == participant
    for owner, values in ((uid, {}), (None, {}), (uid, {'participant_id': participant})):
        with pytest.raises(sa.exc.IntegrityError), conn.begin_nested():
            insert(conn, owner, **values)


@pytest.mark.parametrize('bad', ['italian,grill', '[1]', '{broken', '[["italian"]]'])
def test_ambiguous_conversion_rolls_back(conn, bad):
    legacy(conn)
    uid = user(conn)
    insert(conn, uid, liked_cuisines='["grill"]', allergies=bad)
    with pytest.raises(RuntimeError, match='DB-14'), conn.begin_nested():
        migrate(conn)
    assert conn.execute(sa.text('SELECT liked_cuisines,allergies FROM preferences')).one() == ('["grill"]', bad)
    assert isinstance(sa.inspect(conn).get_columns('preferences')[3]['type'], sa.Text)


@pytest.mark.parametrize('problem', ['duplicate', 'orphan', 'missing', 'both', 'budget'])
def test_invalid_legacy_data_is_not_repaired(conn, problem):
    legacy(conn)
    uid = user(conn)
    insert(conn, uid)
    if problem == 'duplicate':
        insert(conn, uid)
    elif problem == 'orphan':
        conn.execute(sa.text('ALTER TABLE preferences DROP CONSTRAINT preferences_user_id_fkey'))
        insert(conn, uuid4())
    elif problem == 'missing':
        insert(conn, None)
    elif problem == 'both':
        pid = uuid4()
        conn.execute(sa.text('INSERT INTO participants VALUES (:id)'), {'id': pid})
        insert(conn, user(conn), participant_id=pid)
    else:
        conn.execute(sa.text('UPDATE preferences SET budget_min=-1'))
    before = conn.execute(sa.text('SELECT * FROM preferences ORDER BY id')).all()
    with pytest.raises(RuntimeError, match='DB-14'), conn.begin_nested():
        migrate(conn)
    assert conn.execute(sa.text('SELECT * FROM preferences ORDER BY id')).all() == before


def test_downgrade_refuses_data_loss(conn):
    migrate(conn)
    insert(conn, user(conn))
    with pytest.raises(RuntimeError, match='downgrade refused'):
        revision('0003_account_preferences').downgrade()
    assert conn.execute(sa.text('SELECT count(*) FROM preferences')).scalar_one() == 1


def test_model_persists_across_connections_and_failed_save():
    # Real commits in the migrated disposable database, cleaned up afterwards.
    uid, other = uuid4(), uuid4()
    try:
        with Session(engine) as db:
            db.add_all([User(id=x, name='DB14', phone_number=str(x)) for x in (uid, other)])
            db.flush()
            db.add(Preference(user_id=uid, liked_cuisines=['grill'], allergies=[],
                              budget_min=0, budget_max=150, max_distance_km=Decimal('1.5')))
            db.commit()
        with Session(engine) as db:
            saved = db.scalar(sa.select(Preference).where(Preference.user_id == uid))
            assert saved.liked_cuisines == ['grill'] and saved.allergies == []
            assert saved.max_distance_km == Decimal('1.5')
            assert db.scalar(sa.select(Preference).where(Preference.user_id == other)) is None
            saved.budget_max = -1
            with pytest.raises(sa.exc.IntegrityError):
                db.commit()
            db.rollback()
        with Session(engine) as db:
            assert db.scalar(sa.select(Preference.budget_max).where(Preference.user_id == uid)) == 150
    finally:
        with engine.begin() as c:
            c.execute(sa.delete(Preference).where(Preference.user_id.in_([uid, other])))
            c.execute(sa.delete(User).where(User.id.in_([uid, other])))


def adoption_module():
    spec = importlib.util.spec_from_file_location('adopt_existing_schema', VERSIONS.parents[1] / 'adopt_existing_schema.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_unversioned_adoption_preserves_accounts(conn):
    uid = user(conn)
    legacy(conn)
    insert(conn, uid, liked_cuisines='[]')
    adoption_module().adopt(conn)
    assert conn.execute(sa.text('SELECT version_num FROM alembic_version')).scalar_one() == '0002_account_keys_and_phone'
    migrate(conn)
    assert conn.execute(sa.text('SELECT user_id,liked_cuisines FROM preferences')).one() == (uid, [])
    with pytest.raises(ValueError, match='Already versioned'):
        adoption_module().adopt(conn)


def test_adoption_rejects_incompatible_accounts(conn):
    conn.execute(sa.text('ALTER TABLE users DROP CONSTRAINT users_phone_number_key'))
    with pytest.raises(ValueError, match='uniqueness'):
        adoption_module().adopt(conn)
    assert not sa.inspect(conn).has_table('alembic_version')


def test_existing_account_only_table(conn):
    legacy(conn)
    conn.execute(sa.text('ALTER TABLE preferences DROP COLUMN participant_id'))
    uid = user(conn)
    insert(conn, uid, liked_cuisines='[]')
    migrate(conn)
    assert conn.execute(sa.text('SELECT user_id,liked_cuisines FROM preferences')).one() == (uid, [])
    assert not next(c for c in sa.inspect(conn).get_columns('preferences') if c['name'] == 'user_id')['nullable']
