# LanguageTool PHP Proof of Concept

Prueba de concepto para integrar corrección ortográfica en aplicaciones web utilizando LanguageTool, PHP y JavaScript.

## Objetivo

Evaluar la implementación de un corrector ortográfico similar a Microsoft Word para futuras integraciones en sistemas desarrollados con Laravel.

La aplicación permite:

- Enviar texto al servidor LanguageTool.
- Detectar errores ortográficos.
- Obtener sugerencias de corrección.
- Mostrar palabras incorrectas encontradas.
- Preparar la base para futuras funcionalidades de subrayado y corrección interactiva.

---

## Funcionalidades Implementadas

- Subrayado de errores con **CSS Custom Highlight API**: el HTML del editor nunca se reconstruye.
- Se mantienen el cursor, la selección, los saltos de línea y el formato mientras se escribe.
- Validación automática al presionar **Space**, **Enter**, al **pegar** texto y al **salir del editor**.
- Menú de sugerencias junto a la palabra, con reemplazo en un clic (compatible con Ctrl+Z).
- Opciones **Corregir manualmente** e **Ignorar** cuando no hay sugerencias.
- **Diccionario clínico** para evitar falsos positivos con terminología médica, siglas y estadificación TNM.
- Backend PHP con timeouts, validación de tamaño y respuesta reducida.

---

## Tecnologías Utilizadas

### Backend

- PHP 8.3

### Frontend

- HTML5
- JavaScript
- jQuery 3.7
- Bootstrap 5.3

### Corrector Ortográfico

- [LanguageTool-stable.zip](https://languagetool.org/download/)
- [Java 17+](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html)

---

## Requisitos

### PHP

Versión mínima recomendada:

```text
PHP 8.3
```

Extensiones requeridas: `curl` y `mbstring`.

### Java

```text
Java 17 o superior
```

### Navegador

Compatible con CSS Custom Highlight API:

- Chrome / Edge 105+
- Safari 17.2+
- Firefox 140+

---

## Estructura del Proyecto

```text
spellcheck-test/
├── css/
│   └── style.css               # Estilos del editor, subrayado y menú
├── js/
│   └── app.js                  # Lógica del corrector (frontend)
├── check.php                   # Intermediario PHP con LanguageTool
├── diccionario-clinico.txt     # Términos médicos permitidos
├── favicon.ico
└── index.html
```

---

## Instalación

### Paso 1. Verificar Java

```bash
java -version
```

Debe mostrar una versión 17 o superior, por ejemplo:

```text
openjdk version "17.0.x"
```

Si no aparece o la versión es menor, instala Java 17 o superior.

### Paso 2. Descargar LanguageTool

Descarga `LanguageTool-stable.zip` desde [languagetool.org/download](https://languagetool.org/download/) y descomprímelo en una carpeta fuera del proyecto, por ejemplo `C:\LanguageTool`.

> LanguageTool **no se incluye en este repositorio**: se ejecuta como un servicio independiente.

### Paso 3. Levantar el servidor de LanguageTool

Ubícate dentro de la carpeta descomprimida:

```bash
cd C:\LanguageTool
```

Ejecuta:

```bash
java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081
```

Cuando termine de cargar, indicará en la consola que está escuchando en el puerto 8081. **Deja esta terminal abierta** mientras uses el corrector.

### Paso 4. Verificar LanguageTool desde el navegador

Abre:

```text
http://localhost:8081/v2/languages
```

Si responde un JSON con la lista de idiomas, el servidor está funcionando.

### Paso 5. Levantar el proyecto

En una **segunda terminal**, dentro de la carpeta del proyecto:

```bash
php -S localhost:5000
```

Abre en el navegador:

```text
http://localhost:5000
```

---

## Endpoint Utilizado

### LanguageTool

- Método: POST
- Endpoint: http://localhost:8081/v2/check
- Body: `Form URL Encoded`

| Campo | Valor |
|---|---|
| `language` | `es` |
| `text` | `El pacinte tiene dolro abdominal` |

Respuesta (resumida):

```json
{
  "matches": [
    {
      "message": "Se ha encontrado un posible error ortográfico.",
      "offset": 3,
      "length": 7,
      "replacements": [
        { "value": "paciente" }
      ]
    }
  ]
}
```

> La respuesta real de LanguageTool incluye más campos (`rule`, `context`, `sentence`, etc.).

### Proyecto (check.php)

- Método: POST
- Endpoint: http://localhost:5000/check.php
- Body: `Form URL Encoded`

| Campo | Descripción |
|---|---|
| `texto` | Texto a validar (máximo 20.000 caracteres) |

Consulta LanguageTool, descarta los términos del diccionario clínico y devuelve solo lo que usa el frontend:

```json
{
  "matches": [
    {
      "offset": 3,
      "length": 7,
      "message": "Se ha encontrado un posible error ortográfico.",
      "replacements": ["paciente"]
    }
  ]
}
```

---

## Uso

1. Escribe o pega un texto en el editor.
2. Al presionar **Space**, **Enter**, al **pegar** o al **salir del editor**, el texto se valida automáticamente.
3. Las palabras con errores aparecen subrayadas en rojo.
4. Haz clic sobre una palabra subrayada para ver las sugerencias:
    - Clic en una sugerencia para reemplazar la palabra.
    - Si no hay sugerencias: **Corregir manualmente** selecciona la palabra para reescribirla, e **Ignorar** deja de marcarla durante la sesión.
5. **Escape** o un clic fuera del menú lo cierra.

---

## Diccionario Clínico

El archivo `diccionario-clinico.txt` contiene los términos médicos que **no** deben marcarse como error.

- Un término por línea.
- Las líneas que empiezan con `#` son comentarios.
- No distingue mayúsculas de minúsculas.
- Cada variante va en su propia línea (singular/plural, masculino/femenino, con y sin tilde).
- El archivo debe guardarse en **UTF-8**.

Para agregar un término, escríbelo **tal como aparece subrayado** en el editor y guarda el archivo. No es necesario reiniciar ningún servicio.

---

## Configuración

| Parámetro | Archivo | Valor por defecto | Descripción |
|---|---|---|---|
| `LT_URL` | `check.php` | `http://localhost:8081/v2/check` | URL del servidor LanguageTool |
| `MAX_CARACTERES` | `check.php` | `20000` | Largo máximo del texto a validar |
| `MAX_SUGERENCIAS` | `check.php` | `5` | Sugerencias por error |
| `DEBOUNCE_MS` | `js/app.js` | `300` | Espera en milisegundos antes de validar |

---

## Solución de Problemas

| Problema | Causa probable | Solución |
|---|---|---|
| No se subraya nada | LanguageTool no está corriendo | Revisa la terminal del Paso 3 y abre `http://localhost:8081/v2/languages` |
| Error 502 en `check.php` | PHP no logra conectarse a LanguageTool | Verifica el puerto y el valor de `LT_URL` |
| El puerto 8081 está ocupado | Otro servicio usa el puerto | Levanta LanguageTool con otro `--port` y actualiza `LT_URL` |
| Un término médico aparece como error | No está en el diccionario | Agrégalo a `diccionario-clinico.txt` |
| Tildes o ñ no coinciden en el diccionario | Archivo con otra codificación | Guarda `diccionario-clinico.txt` en UTF-8 |
| Aparece doble subrayado | Corrector nativo del navegador | Verifica que el editor tenga `spellcheck="false"` |

---

## Estado

Prueba de concepto funcional, preparada para su futura integración en los sistemas internos desarrollados en **Laravel 8**.