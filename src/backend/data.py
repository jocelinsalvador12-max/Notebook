import requests
from fastapi import HTTPException
try:
    from src.backend.config import settings
except ImportError:
    try:
        from .config import settings
    except ImportError:
        from config import settings

def query_turso(sql: str, args: list = None) -> dict:
    if args is None:
        args = []

    if not settings.TURSO_URL or not settings.TURSO_TOKEN:
        raise HTTPException(status_code=503, detail="La conexión con Turso no está configurada.")

    headers = {
        "Authorization": f"Bearer {settings.TURSO_TOKEN}",
        "Content-Type": "application/json"
    }

    payload = {
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": args}},
            {"type": "close"}
        ]
    }

    try:
        response = requests.post(settings.TURSO_URL, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()

        result = data.get("results", [{}])[0]
        if result.get("type") == "error":
            raise HTTPException(status_code=500, detail="Turso rechazó la operación de base de datos.")

        return data
    except requests.exceptions.Timeout as e:
        raise HTTPException(status_code=504, detail="Turso tardó demasiado en responder.") from e
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail="No se pudo conectar con Turso.") from e
    except ValueError as e:
        raise HTTPException(status_code=502, detail="Turso devolvió una respuesta inválida.") from e
