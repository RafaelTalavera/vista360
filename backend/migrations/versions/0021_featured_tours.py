"""Selección de hasta cuatro recorridos para el inicio público."""
from alembic import op
import sqlalchemy as sa

revision = '0021_featured_tours'
down_revision = '0020_saved_delivery_pdf'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('featured_tours',
        sa.Column('position', sa.Integer(), primary_key=True),
        sa.Column('tour_id', sa.Uuid(), sa.ForeignKey('tours.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(16), nullable=False),
        sa.Column('summary', sa.String(240), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.CheckConstraint('position BETWEEN 1 AND 4', name='position_valid'),
        sa.CheckConstraint("category IN ('home', 'hotel', 'business', 'other')", name='category_valid'),
        sa.UniqueConstraint('tour_id'),
    )


def downgrade():
    op.drop_table('featured_tours')
