const TURSO_URL = "https://notebook-jocelinsalvador.aws-us-west-2.turso.io/v2/pipeline";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg5MjI0OTMsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.QHKN3nVYK5BTLEYsIBeO4I1ta3P2WFla47UnQQ6w1E3afZJg_PF5Gw_alAsq1U9xW01F7IOcp__7sIaKSj1ZCg";

async function ejecutarSQL(sql, args = []) {
  try {
    const response = await fetch(TURSO_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TURSO_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: sql, args: args } },
          { type: "close" }
        ]
      })
    });

    const data = await response.json();

    if (data.results && data.results[0].type === "error") {
      console.error("Error en Turso:", data.results[0].error);
      alert("Error SQL: " + data.results[0].error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error("Error de conexión:", err);
    alert("Error de conexión al servidor");
    return null;
  }
}

document.addEventListener("DOMContentLoaded", cargarNotas);

async function cargarNotas() {
  const res = await ejecutarSQL("SELECT id, title, content FROM Notas");
  if (!res || !res.results[0].response) return;

  const resultObj = res.results[0].response.result;
  const filas = resultObj.rows || [];
  const lista = document.getElementById("notes-list");
  lista.innerHTML = "";

  filas.forEach(row => {
    const id = row[0].value;
    const title = row[1] ? row[1].value : "Sin título";
    const content = row[2] ? row[2].value : "";

    const li = document.createElement("li");
    li.textContent = title;
    li.onclick = () => seleccionarNota(id, title, content);
    lista.appendChild(li);
  });
}

function nuevaNota() {
  document.getElementById("note-id").value = "";
  document.getElementById("note-title").value = "";
  document.getElementById("note-content").value = "";
}

function seleccionarNota(id, title, content) {
  document.getElementById("note-id").value = id;
  document.getElementById("note-title").value = title;
  document.getElementById("note-content").value = content;
}

async function guardarNota() {
  const idInput = document.getElementById("note-id").value;
  const title = document.getElementById("note-title").value;
  const content = document.getElementById("note-content").value;

  if (!title.trim()) {
    alert("Ingresa un título para la nota");
    return;
  }

  if (idInput) {
    await ejecutarSQL(
      "UPDATE Notas SET title = ?, content = ? WHERE id = ?",
      [
        { type: "text", value: title },
        { type: "text", value: content },
        { type: "integer", value: String(idInput) }
      ]
    );
  } else {
    await ejecutarSQL(
      "INSERT INTO Notas (title, content) VALUES (?, ?)",
      [
        { type: "text", value: title },
        { type: "text", value: content }
      ]
    );
  }

  nuevaNota();
  await cargarNotas();
}

async function eliminarNota() {
  const idInput = document.getElementById("note-id").value;
  const titleInput = document.getElementById("note-title").value;

  // 1. Verificar si hay una nota seleccionada
  if (!idInput) {
    alert("Selecciona una nota de la lista para eliminar.");
    return;
  }

  // 2. Ventana de confirmación
  const nombreNota = titleInput ? `"${titleInput}"` : "esta nota";
  const confirmar = confirm(`¿Estás seguro de que deseas eliminar ${nombreNota}? Esta acción no se puede deshacer.`);

  // 3. Cancelar si el usuario presiona "Cancelar"
  if (!confirmar) return;

  // 4. Ejecutar borrado si el usuario presiona "Aceptar"
  await ejecutarSQL(
    "DELETE FROM Notas WHERE id = ?",
    [{ type: "integer", value: String(idInput) }]
  );

  nuevaNota();
  await cargarNotas();
}