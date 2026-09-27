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

## Tecnologías Utilizadas

### Backend

- PHP 8.3

### Frontend

- HTML5
- JavaScript
- jQuery 3.7

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

## EndPont Utilizado

- Metodo: POST
- Endpoint: http://localhost:8081/v2/check