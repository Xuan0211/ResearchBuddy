from sqlmodel import create_engine, Session, SQLModel
from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


def init_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
