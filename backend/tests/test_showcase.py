from uuid import UUID, uuid4

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.modules.platform.models import FeaturedTour
from app.modules.publications.models import Publication
from app.modules.tours.models import Tour
from test_assets import drain
from test_platform_accounts import administrator
from test_publications import ready, publish


def payload(tour_id):
    return dict(tour_id=str(tour_id), category='hotel', summary='Una visita por los ambientes del hotel.',
                is_demo=True, permission_confirmed=True)


def snapshot(database, owner_id, title='Hotel público'):
    with Session(database[0]) as db:
        tour = Tour(owner_id=UUID(owner_id), title='Título privado', slug='example-' + uuid4().hex)
        db.add(tour); db.flush()
        scene = str(uuid4())
        publication = Publication(tour_id=tour.id, version=1, revision=0, status='active', storage_backend='local',
            document=dict(title=title, start_scene_id=scene, scenes=[dict(id=scene, sources=[
                dict(width=4096, height=2048, key='large', asset_id=str(uuid4())),
                dict(width=1024, height=512, key='small', asset_id=str(uuid4())),
            ])]))
        db.add(publication); db.flush()
        tour.status = 'published'; tour.published_version_id = publication.id
        db.commit()
        return tour.id, tour.slug, publication.id


def test_permissions_validation_and_four_places(clients, database, monkeypatch):
    visitor = clients(); owner = clients(); user = owner.register().json()['user']
    admin = clients(); administrator(admin, monkeypatch)
    tour_id, _, _ = snapshot(database, user['id'])
    for client, status in [(visitor, 401), (owner, 403)]:
        for path in ['/admin/featured-tours', '/admin/featured-tours/candidates']:
            assert client.get(path).status_code == status
        assert client.mutate('PUT', '/admin/featured-tours/1', payload(tour_id)).status_code == status
        assert client.mutate('DELETE', '/admin/featured-tours/1').status_code == status
    assert admin.http.put('/api/v1/admin/featured-tours/1', json=payload(tour_id)).status_code == 403
    for position in [0, 5]:
        assert admin.mutate('PUT', f'/admin/featured-tours/{position}', payload(tour_id)).status_code == 422
    base = payload(tour_id)
    for field, value in [('permission_confirmed', False), ('summary', ' '), ('summary', 'x' * 241), ('category', 'private')]:
        assert admin.mutate('PUT', '/admin/featured-tours/1', {**base, field: value}).status_code == 422
    assert admin.mutate('PUT', '/admin/featured-tours/1', {k:v for k,v in base.items() if k != 'permission_confirmed'}).status_code == 422
    for position in [4, 1, 3, 2]:
        current, _, _ = snapshot(database, user['id'], f'Hotel {position}')
        assert admin.mutate('PUT', f'/admin/featured-tours/{position}', payload(current)).status_code == 200
    assert [item['position'] for item in visitor.get('/public/featured-tours').json()] == [1, 2, 3, 4]
    first = admin.get('/admin/featured-tours').json()[0]
    assert admin.mutate('PUT', '/admin/featured-tours/2', payload(first['tour_id'])).status_code == 409
    assert admin.get('/admin/featured-tours').headers['cache-control'] == 'no-store'


def test_real_publication_without_session_and_private_drafts(clients, database, monkeypatch):
    owner, tour, _ = ready(clients, database)
    admin = clients(); administrator(admin, monkeypatch); visitor = clients()
    assert visitor.get('/public/featured-tours').json() == []
    assert admin.mutate('PUT', '/admin/featured-tours/1', payload(tour['id'])).status_code == 409
    publish(owner, tour); drain(database)
    assert admin.mutate('PUT', '/admin/featured-tours/1', payload(tour['id'])).status_code == 200
    result = visitor.get('/public/featured-tours')
    assert result.headers['cache-control'] == 'no-store'
    card = result.json()[0]
    assert card['title'] == tour['title'] and card['path'] == '/tour/' + tour['slug'] and card['is_demo'] is True
    assert visitor.http.get(card['cover_url']).status_code == 200
    assert visitor.get('/public/tours/' + tour['slug']).status_code == 200
    for secret in ['owner_id', 'tour_id', 'organization_id', 'email', 'storage_key', 'revision', 'checksum']:
        assert secret not in result.text
    assert owner.mutate('PUT', '/tours/' + tour['id'], dict(title='Borrador confidencial', slug=tour['slug'])).status_code == 200
    assert visitor.get('/public/featured-tours').json()[0]['title'] == tour['title']
    publish(owner, tour); drain(database)
    assert visitor.get('/public/featured-tours').json()[0]['title'] == 'Borrador confidencial'
    assert owner.mutate('POST', '/tours/' + tour['id'] + '/unpublish').status_code == 200
    assert visitor.get('/public/featured-tours').json() == []
    assert admin.get('/admin/featured-tours').json()[0]['available'] is False
    assert admin.mutate('PUT', '/admin/featured-tours/1', payload(tour['id'])).status_code == 409
    assert admin.mutate('DELETE', '/admin/featured-tours/1').status_code == 204
    assert owner.get('/tours/' + tour['id']).status_code == 200
    assert admin.get('/admin/featured-tours').json() == []


def test_search_pagination_and_cascade(clients, database, monkeypatch):
    admin = clients(); user = administrator(admin, monkeypatch)
    first, slug, _ = snapshot(database, user['id'], 'Hotel del Sol')
    second, _, _ = snapshot(database, user['id'], 'Casa del Lago')
    admin.mutate('POST', '/tours', dict(title='Borrador', slug='borrador'))
    assert admin.get('/admin/featured-tours/candidates?limit=1').json()['total'] == 2
    a = admin.get('/admin/featured-tours/candidates?limit=1').json()['items']
    b = admin.get('/admin/featured-tours/candidates?offset=1&limit=1').json()['items']
    assert {row['id'] for row in a + b} == {str(first), str(second)}
    assert admin.get('/admin/featured-tours/candidates?q=HOTEL').json()['items'] == [dict(id=str(first), title='Hotel del Sol', path='/tour/' + slug)]
    for term in ['%', '_', 'Título privado', 'Borrador']:
        assert admin.get('/admin/featured-tours/candidates?q=' + term).json()['items'] == []
    for params in ['limit=0', 'limit=101', 'offset=-1', 'q=' + 'x' * 161]:
        assert admin.get('/admin/featured-tours/candidates?' + params).status_code == 422
    assert admin.mutate('PUT', '/admin/featured-tours/1', payload(first)).status_code == 200
    assert admin.mutate('DELETE', '/admin/featured-tours/1').status_code == 204
    with Session(database[0]) as db:
        assert db.get(Tour, first) is not None
    admin.mutate('PUT', '/admin/featured-tours/1', payload(first))
    with Session(database[0]) as db:
        tour = db.get(Tour, first); tour.published_version_id = None; tour.status = 'draft'; db.flush()
        db.delete(tour); db.commit()
        assert db.get(FeaturedTour, 1) is None


def test_s3_cover_uses_smallest_public_source(clients, database, monkeypatch):
    from app.core.config import get_settings
    admin = clients(); user = administrator(admin, monkeypatch)
    tour_id, _, publication_id = snapshot(database, user['id'])
    admin.mutate('PUT', '/admin/featured-tours/1', payload(tour_id))
    with Session(database[0]) as db:
        db.get(Publication, publication_id).storage_backend = 's3'; db.commit()
    monkeypatch.setattr(get_settings(), 'public_media_base_url', 'https://media.example.com/public/')
    assert clients().get('/public/featured-tours').json()[0]['cover_url'] == 'https://media.example.com/public/small'
    monkeypatch.setattr(get_settings(), 'public_media_base_url', None)
    assert clients().get('/public/featured-tours').json() == []


def test_migration_roundtrip(database):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.downgrade(config, '0020_saved_delivery_pdf')
    assert 'featured_tours' not in inspect(database[0]).get_table_names()
    command.upgrade(config, 'head')
    assert 'featured_tours' in inspect(database[0]).get_table_names()


def test_admin_directory_lists_all_owners_and_filters_without_opening_drafts(clients, database, monkeypatch):
    visitor = clients(); owner = clients(); first_user = owner.register('hotel-owner@example.com').json()['user']
    second = clients(); second.register('house-owner@example.com')
    admin = clients(); administrator(admin, monkeypatch)
    first, slug, _ = snapshot(database, first_user['id'], 'Hotel publicado')
    draft = second.mutate('POST', '/tours', dict(title='Casa borrador', slug='casa-borrador')).json()
    for client, code in [(visitor, 401), (owner, 403), (second, 403)]:
        assert client.get('/admin/tours').status_code == code
    result = admin.get('/admin/tours')
    assert result.status_code == 200 and result.headers['cache-control'] == 'no-store'
    assert result.json()['total'] == 2
    rows = {item['id']: item for item in result.json()['items']}
    assert rows[str(first)]['owner_email'] == 'hotel-owner@example.com'
    assert rows[str(first)]['public_path'] == '/tour/' + slug
    assert rows[draft['id']]['public_path'] is None
    assert rows[draft['id']]['status'] == 'draft'
    for forbidden in ['scenes', 'hotspots', 'password_hash', 'storage_key', 'sources']:
        assert forbidden not in result.text
    assert owner.get('/tours/' + draft['id']).status_code == 404
    for query, expected in [('status=draft', draft['id']), ('status=published', str(first)),
                            ('q=HOTEL-OWNER', str(first)), ('q=Hotel%20publicado', str(first))]:
        found = admin.get('/admin/tours?' + query).json()
        assert found['total'] == 1 and found['items'][0]['id'] == expected
    for query in ['q=%25', 'q=_', 'offset=100']:
        assert admin.get('/admin/tours?' + query).json()['items'] == []
    first_page = admin.get('/admin/tours?limit=1').json()['items']
    second_page = admin.get('/admin/tours?offset=1&limit=1').json()['items']
    assert len({row['id'] for row in first_page + second_page}) == 2
    for query in ['status=deleted', 'limit=0', 'limit=101', 'offset=-1', 'q=' + 'a' * 161]:
        assert admin.get('/admin/tours?' + query).status_code == 422
    admin.mutate('PUT', '/admin/featured-tours/1', payload(first))
    featured = admin.get('/admin/tours?status=published').json()['items'][0]
    assert featured['featured']['position'] == 1 and featured['featured']['available'] is True


def test_owner_deleting_featured_tour_removes_home_and_admin_directory(clients, database, monkeypatch):
    owner, tour, _ = ready(clients, database)
    admin = clients(); administrator(admin, monkeypatch); visitor = clients()
    publish(owner, tour); drain(database)
    assert admin.mutate('PUT', '/admin/featured-tours/1', payload(tour['id'])).status_code == 200
    assert len(visitor.get('/public/featured-tours').json()) == 1
    assert len(admin.get('/admin/tours').json()['items']) == 1
    assert owner.mutate('DELETE', '/tours/' + tour['id']).status_code == 204
    assert visitor.get('/public/featured-tours').json() == []
    assert admin.get('/admin/featured-tours').json() == []
    assert admin.get('/admin/tours').json()['items'] == []
    assert visitor.get('/public/tours/' + tour['slug']).status_code == 404
    drain(database)
