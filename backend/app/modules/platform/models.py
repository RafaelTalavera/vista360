from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FeaturedTour(Base):
    """Selección editorial de la plataforma; nunca publica un borrador."""
    __tablename__ = 'featured_tours'
    __table_args__ = (
        CheckConstraint('position BETWEEN 1 AND 4', name='position_valid'),
        CheckConstraint("category IN ('home', 'hotel', 'business', 'other')", name='category_valid'),
        UniqueConstraint('tour_id'),
    )
    position: Mapped[int] = mapped_column(primary_key=True)
    tour_id: Mapped[UUID] = mapped_column(ForeignKey('tours.id', ondelete='CASCADE'))
    category: Mapped[str] = mapped_column(String(16))
    summary: Mapped[str] = mapped_column(String(240))
    is_demo: Mapped[bool] = mapped_column(Boolean)
