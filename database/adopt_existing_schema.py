"""Verify an unversioned DB-03 account schema; optionally stamp its baseline.

Does not create, drop, or rewrite application tables. Run with the migration
owner's DATABASE_URL. DB-14 subsequently validates the existing preferences.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from app.core.database import engine  # pyright: ignore[reportMissingImports]


def verify_accounts(conn):
    inspector = sa.inspect(conn)
    if inspector.has_table('alembic_version'):
        raise ValueError('Already versioned: use the normal Alembic workflow.')
    if not inspector.has_table('users'):
        raise ValueError('No users table: use alembic upgrade head for a clean database.')
    columns = {c['name']: c for c in inspector.get_columns('users')}
    expected = {'id': (sa.Uuid, False), 'name': (sa.Text, False),
                'phone_number': (sa.Text, False), 'push_token': (sa.Text, True),
                'created_at': (sa.DateTime, False)}
    if set(columns) != set(expected):
        raise ValueError('Account columns do not match DB-03; reconcile before adoption.')
    for name, (kind, nullable) in expected.items():
        c = columns[name]
        if not isinstance(c['type'], kind) or c['nullable'] != nullable:
            raise ValueError(f'Account column {name} does not match DB-03.')
    if columns['created_at']['type'].timezone:
        raise ValueError('Account timestamps do not match DB-03.')
    if inspector.get_pk_constraint('users')['constrained_columns'] != ['id']:
        raise ValueError('Account primary key must be id alone.')
    if not any(c['column_names'] == ['phone_number'] for c in inspector.get_unique_constraints('users')):
        raise ValueError('Account phone uniqueness is missing.')
    # Also prove this connection can read accounts; never print account values.
    conn.execute(sa.text('SELECT id FROM users LIMIT 1'))


def adopt(conn):
    verify_accounts(conn)
    config = Config(str(ROOT / 'database/alembic.ini'))
    MigrationContext.configure(conn).stamp(ScriptDirectory.from_config(config), '0002_account_keys_and_phone')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stamp', action='store_true', help='Record verified DB-03 baseline; application data is unchanged.')
    args = parser.parse_args()
    try:
        with engine.begin() as conn:
            if args.stamp:
                adopt(conn)
            else:
                verify_accounts(conn)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception:
        print('Adoption failed. Check database privileges/configuration; no credentials or row values are shown.', file=sys.stderr)
        return 1
    print('DB-03 baseline stamped; now run alembic upgrade head.' if args.stamp else 'DB-03 account schema verified. No changes made.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
