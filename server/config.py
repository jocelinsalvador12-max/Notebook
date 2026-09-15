import os
from dotenv import load_dotenv

# Cargar las variables definidas en el archivo .env
load_dotenv()

class Settings:
    # URL y Token de autenticación de Turso DB
    TURSO_URL: str = os.getenv(
        "TURSO_URL", 
        "libsql://notebook-jocelinsalvador.aws-us-west-2.turso.io"
    )
    TURSO_TOKEN: str = os.getenv("TURSO_TOKEN", "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk0NDY2ODQsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.y4TcIV-wWvogfyqZw9tNwFBE8LLjIjsrsKtaP8gYs08U-S_z51yt10tDWeKZYXyWsX_MP_4MpT553GM9384YCg")

    # Configuración de la aplicación
    APP_NAME: str = "Notebook API"
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1", "t")

# Instancia global de configuración
settings = Settings()