import requests
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
        response = requests.post(settings.TURSO_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

        result = data.get("results", [{}])[0]
        if result.get("type") == "error":
            print(f"[Error SQL]: {result.get('error')}")
            return None

        return data
    except requests.exceptions.RequestException as e:
        print(f"[Error de Conexión]: {e}")
        return None