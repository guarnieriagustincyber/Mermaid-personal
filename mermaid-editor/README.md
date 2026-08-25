# ⚡ MermaidFlow Studio

> **Editor visual interactivo de diagramas de flujo sin límites con auto-organización automática y exportación instantánea a código Mermaid.**

Diseñado para uso cotidiano, rápido y ágil. Te permite crear diagramas arrastrando y soltando, auto-alinear los nodos en 1 clic y copiar directamente el código Mermaid listo para pegar en **Obsidian, GitHub, Notion, VS Code o Mermaid Live**.

---

## 🚀 ¿Cómo abrir la herramienta?

Puedes abrirla de cualquiera de las siguientes formas:

### Opción 1: Directo en tu navegador
Haz doble clic en [`mermaid-editor/index.html`](index.html) o ábrelo con tu navegador preferido (Chrome, Firefox, Brave, Edge).

### Opción 2: Servidor local ligero (Python)
Si prefieres servirlo como aplicación web local:
```bash
cd /media/agustin/Laboratorio/Ciberseguiradad/Agustin/mermaid-editor
python3 -m http.server 8080
```
Y abre `http://localhost:8080` en tu navegador.

---

## ✨ Características Principales

* 🎯 **Lienzo Infinito:** Zoom con la rueda del ratón y paneo arrastrando el fondo.
* ⚡ **Auto-Organizar (Auto-Layout):** Botón inteligente de 1-clic que calcula los niveles jerárquicos y posiciona todos los nodos sin cruces desordenados.
* 🔀 **Orientaciones de Flujo:**
  * Arriba hacia Abajo (`flowchart TD`)
  * Izquierda a Derecha (`flowchart LR`)
  * Abajo hacia Arriba (`flowchart BT`)
  * Derecha a Izquierda (`flowchart RL`)
* 🎨 **Formas Oficiales de Mermaid:**
  * **Inicio / Fin:** `([Texto])`
  * **Proceso:** `[Texto]`
  * **Decisión:** `{¿Condición?}`
  * **Base de Datos:** `[(Texto)]`
  * **Entrada / Salida (I/O):** `[/Texto/]`
  * **Subproceso / Función:** `[[Texto]]`
* 🔌 **Conexiones Interactivas:**
  * Arrastra desde los puntos magnéticos de cualquier nodo a otro.
  * Haz clic en una flecha para asignar condiciones (`Sí`, `No`, `Error`, etc.) o cambiar el estilo a punteado (`-.->`) o grueso (`==>`).
* 📋 **Copia Instantánea:** Botón destacado **"Copiar Mermaid"** que copia el código con sangría limpia al portapapeles.
* 💾 **Persistencia Automática:** Todo se guarda en tu navegador (`localStorage`) para que nunca pierdas tu trabajo al cerrar o recargar.
* 📂 **Plantillas Rápidas:** Ejemplos listos para usar de *Autenticación*, *Pasarelas de Pago* y *Data Pipelines*.
* 🌓 **Modo Oscuro / Claro:** Alterna entre temas visuales modernos.

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
| :--- | :--- |
| **Doble Clic en nodo** | Editar el texto del nodo |
| **Doble Clic en el fondo** | Crear un nuevo nodo de proceso rápidamente |
| **Supr / Backspace** | Eliminar el nodo o conexión seleccionada |
| **Ctrl + Z** | Deshacer |
| **Ctrl + Y / Ctrl + Shift + Z** | Rehacer |
| **Ctrl + C** | Copiar código Mermaid al portapapeles |
| **Rueda del Ratón** | Zoom centrado en el cursor |
