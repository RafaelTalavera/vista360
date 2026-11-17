from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import require_csrf
from app.modules.platform.models import FeaturedTour
from app.modules.publications.models import Publication
from app.modules.studio.router import administrator
from app.modules.tours.models import Tour

router = APIRouter(tags=['showcase'])
Category = Literal['home', 'hotel', 'business', 'other']


class FeaturedInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    tour_id: UUID
    category: Category
    summary: str = Field(min_length=1, max_length=240)
    is_demo: bool
    permission_confirmed: Literal[True]


class FeaturedCard(BaseModel):
    position: int
    title: str
    path: str
    cover_url: str
    category: Category
    summary: str
    is_demo: bool


class FeaturedSetting(BaseModel):
    position: int
    tour_id: UUID
    title: str
    category: Category
    summary: str
    is_demo: bool
    available: bool


class FeaturedCandidate(BaseModel):
    id: UUID
    title: str
    path: str


class FeaturedCandidates(BaseModel):
    items: list[FeaturedCandidate]
    total: int
    offset: int
    limit: int


def published():
    return select(Tour, Publication).join(Publication, Publication.id == Tour.published_version_id).where(
        Tour.status == 'published', Publication.status == 'active')


@router.get('/public/featured-tours', response_model=list[FeaturedCard])
def public_featured(response: Response, db: Session = Depends(get_db)):
    # No almacenar la selección: una publicación retirada debe desaparecer del inicio.
    response.headers['Cache-Control'] = 'no-store'
    rows = db.execute(published().add_columns(FeaturedTour).join(FeaturedTour, FeaturedTour.tour_id == Tour.id)
                      .order_by(FeaturedTour.position))
    cards = []
    for tour, publication, feature in rows:
        document = publication.document
        scene = next((s for s in document['scenes'] if s['id'] == document['start_scene_id']), None)
        if not scene or not scene['sources']:
            continue
        source = min(scene['sources'], key=lambda item: item['width'])
        if publication.storage_backend == 's3':
            base = get_settings().public_media_base_url
            if not base:
                continue
            cover = f"{base.rstrip('/')}/{source['key']}"
        else:
            if get_settings().app_env == 'production':
                continue
            cover = f"/api/v1/public/media/{publication.id}/{source['asset_id']}"
        cards.append(FeaturedCard(position=feature.position, title=document['title'], path=f'/tour/{tour.slug}',
            cover_url=cover, category=feature.category, summary=feature.summary, is_demo=feature.is_demo))
    return cards


@router.get('/admin/featured-tours', response_model=list[FeaturedSetting])
def settings(db: Session = Depends(get_db), actor: User = Depends(administrator)):
    rows = db.execute(select(FeaturedTour, Tour, Publication).join(Tour, Tour.id == FeaturedTour.tour_id)
        .outerjoin(Publication, Publication.id == Tour.published_version_id).order_by(FeaturedTour.position))
    return [FeaturedSetting(position=feature.position, tour_id=tour.id,
        title=publication.document['title'] if publication else tour.title,
        category=feature.category, summary=feature.summary, is_demo=feature.is_demo,
        available=tour.status == 'published' and publication is not None and publication.status == 'active')
        for feature, tour, publication in rows]


@router.get('/admin/featured-tours/candidates', response_model=FeaturedCandidates)
def candidates(q: str = Query(default='', max_length=160), offset: int = Query(default=0, ge=0),
               limit: int = Query(default=50, ge=1, le=100),
               db: Session = Depends(get_db), actor: User = Depends(administrator)):
    query = published()
    if term := q.strip():
        query = query.where(Publication.document['title'].astext.icontains(term, autoescape=True))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(Tour.created_at.desc(), Tour.id).offset(offset).limit(limit))
    return FeaturedCandidates(total=total, offset=offset, limit=limit, items=[
        FeaturedCandidate(id=tour.id, title=publication.document['title'], path=f'/tour/{tour.slug}')
        for tour, publication in rows])


@router.put('/admin/featured-tours/{position}', response_model=FeaturedSetting, dependencies=[Depends(require_csrf)])
def save(data: FeaturedInput, position: int = Path(ge=1, le=4),
         db: Session = Depends(get_db), actor: User = Depends(administrator)):
    # Serializa con la publicación/retiro del recorrido. La selección no altera el trabajo.
    row = db.execute(published().where(Tour.id == data.tour_id).with_for_update(of=Tour)).first()
    if row is None:
        raise HTTPException(409, 'Elegí un recorrido con una publicación activa')
    tour, publication = row
    feature = db.get(FeaturedTour, position)
    if feature is None:
        feature = FeaturedTour(position=position)
        db.add(feature)
    for key, value in data.model_dump(exclude={'permission_confirmed'}).items():
        setattr(feature, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Ese recorrido ya ocupa otro lugar destacado') from None
    return FeaturedSetting(position=position, tour_id=tour.id, title=publication.document['title'],
        category=feature.category, summary=feature.summary, is_demo=feature.is_demo, available=True)


@router.delete('/admin/featured-tours/{position}', status_code=204, dependencies=[Depends(require_csrf)])
def remove(position: int = Path(ge=1, le=4), db: Session = Depends(get_db), actor: User = Depends(administrator)):
    db.execute(delete(FeaturedTour).where(FeaturedTour.position == position))
    db.commit()
