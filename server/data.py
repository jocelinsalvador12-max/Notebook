import os
import requests
from dotenv import load_dotenv

# Cargar variables de entorno desde el archivo .env
load_dotenv()

TURSO_URL = os.getenv("TURSO_URL", "https://notebook-jocelinsalvador.aws-us-west-2.turso.io/v2/pipeline")
TURSO_TOKEN = os.getenv("eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk0NDU2MTAsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.c6fsNUEnJKfbBfME6_B4ub86ICVkePsoipXvlj-0kuu7iyF-ohVI-P57j-yBMenQBl4bbroyuoUmYfdDEv4aCw")

def query_turso(sql: str, args: list = None) -> dict:
    """
    Ejecuta una sentencia SQL en la base de datos de Turso a través de su API HTTP v2 pipeline.
    """
    if args is None:
        args = []

    headers = {
        "Authorization": f"Bearer {TURSO_TOKEN}",
        "Content-Type": "application/json"
    }

    payload = {
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": args}},
            {"type": "close"}
        ]
    }

    try:
        response = requests.post(TURSO_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

        # Verificar si la respuesta contiene un error retornado por Turso/SQL
        result = data.get("results", [{}])[0]
        if result.get("type") == "error":
            print(f"[Error SQL] en query '{sql}': {result.get('error')}")
            return None

        return data
    except requests.exceptions.RequestException as e:
        print(f"[Error de Conexión] No se pudo conectar a Turso: {e}")
        return None