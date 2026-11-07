import os
from dotenv import load_dotenv

# Cargar las variables definidas en el archivo .env
load_dotenv()

class Settings:
    # URL y Token de autenticación de Turso DB
    # Aceptamos los nombres documentados por la app JS y los anteriores del
    # backend Python para que ambas formas de despliegue sigan funcionando.
    TURSO_URL: str = os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_URL", "")
    TURSO_TOKEN: str = os.getenv("TURSO_AUTH_TOKEN") or os.getenv("TURSO_TOKEN", "")

    # Configuración de la aplicación
    APP_NAME: str = "Notebook API"
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1", "t")

# Instancia global de configuración
settings = Settings()
