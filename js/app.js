'use strict';

const CorrectorOrtografico = (function ($) {

    // Espera tras Space/Enter/Pegar antes de validar (agrupa pulsaciones rápidas)
    const DEBOUNCE_MS = 0;

    // Elementos que el navegador genera como "párrafo" al presionar ENTER
    const BLOQUES = new Set([
        'DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'BLOCKQUOTE', 'PRE', 'TABLE', 'TR'
    ]);

    const soportaHighlights =
        typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

    const highlight = soportaHighlights ? new Highlight() : null;

    let editor = null;
    let $menu = null;
    let url = '';
    let timer = null;
    let xhr = null;
    let errores = [];                // [{ rango, mensaje, sugerencias }]
    let errorActivo = null;
    let ultimoTextoValidado = null;  // evita reenviar el mismo texto
    const ignoradas = new Set();     // palabras ignoradas (en minúsculas)

    /* ------------------------------------------------------------------
     * Modelo de texto: texto plano + mapa de qué nodo de texto
     * ocupa cada tramo. No modifica el DOM.
     * ------------------------------------------------------------------ */
    function construirModelo() {
        const segmentos = [];
        let texto = '';

        function salto() {
            if (texto.length > 0 && !texto.endsWith('\n')) {
                texto += '\n';
            }
        }

        function recorrer(nodo) {
            for (let hijo = nodo.firstChild; hijo; hijo = hijo.nextSibling) {

                if (hijo.nodeType === Node.TEXT_NODE) {
                    if (hijo.data.length === 0) {
                        continue;
                    }
                    segmentos.push({
                        nodo: hijo,
                        inicio: texto.length,
                        fin: texto.length + hijo.data.length
                    });
                    texto += hijo.data;

                } else if (hijo.nodeType === Node.ELEMENT_NODE) {

                    if (hijo.nodeName === 'BR') {
                        texto += '\n';
                        continue;
                    }

                    const esBloque = BLOQUES.has(hijo.nodeName);

                    if (esBloque) salto();
                    recorrer(hijo);
                    if (esBloque) salto();
                }
            }
        }

        recorrer(editor);

        return { texto, segmentos };
    }

    /* Búsqueda binaria: offset del texto plano -> (nodo, offset dentro del nodo) */
    function ubicar(segmentos, pos, esFin) {
        let lo = 0;
        let hi = segmentos.length - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const s = segmentos[mid];

            const aLaIzquierda = esFin ? pos <= s.inicio : pos < s.inicio;
            const aLaDerecha = esFin ? pos > s.fin : pos >= s.fin;

            if (aLaIzquierda) {
                hi = mid - 1;
            } else if (aLaDerecha) {
                lo = mid + 1;
            } else {
                return { nodo: s.nodo, offset: pos - s.inicio };
            }
        }

        return null;
    }

    function crearRango(modelo, offset, length) {
        const inicio = ubicar(modelo.segmentos, offset, false);
        const fin = ubicar(modelo.segmentos, offset + length, true);

        if (!inicio || !fin) {
            return null;
        }

        const rango = document.createRange();
        rango.setStart(inicio.nodo, inicio.offset);
        rango.setEnd(fin.nodo, fin.offset);

        return rango;
    }

    /* ------------------------------------------------------------------
     * Pintado de errores (sin tocar el HTML)
     * ------------------------------------------------------------------ */
    function limpiar() {
        errores = [];
        if (highlight) {
            highlight.clear();
        }
    }

    function pintar(matches, modelo) {
        limpiar();

        matches.forEach(function (m) {
            const rango = crearRango(modelo, m.offset, m.length);

            if (!rango) {
                return;
            }

            const palabra = rango.toString();

            if (!palabra.trim() || ignoradas.has(palabra.toLowerCase())) {
                return;
            }

            errores.push({
                rango: rango,
                mensaje: m.message || '',
                sugerencias: m.replacements || []
            });

            if (highlight) {
                highlight.add(rango);
            }
        });
    }

    function quitarError(err) {
        errores = errores.filter(e => e !== err);
        if (highlight) {
            highlight.delete(err.rango);
        }
    }

    function errorEnCursor() {
        const sel = window.getSelection();

        if (!sel.rangeCount || !sel.isCollapsed) {
            return null;
        }

        return errores.find(function (e) {
            try {
                return !e.rango.collapsed &&
                    e.rango.isPointInRange(sel.anchorNode, sel.anchorOffset);
            } catch (ex) {
                return false;
            }
        }) || null;
    }

    /* ------------------------------------------------------------------
     * Comunicación con el backend
     * ------------------------------------------------------------------ */
    function validar() {
        const modelo = construirModelo();
        const textoEnviado = modelo.texto;

        // Mismo texto que la última validación: no hay nada nuevo que revisar
        if (textoEnviado === ultimoTextoValidado) {
            return;
        }

        if (xhr) {
            xhr.abort(); // cancela la petición anterior si aún no respondió
        }

        if (!textoEnviado.trim()) {
            limpiar();
            ultimoTextoValidado = textoEnviado;
            return;
        }

        xhr = $.ajax({
            url: url,
            type: 'POST',
            dataType: 'json',
            data: {
                // &nbsp; -> espacio normal (mismo largo, no altera offsets)
                texto: textoEnviado.replace(/\u00A0/g, ' ')
            }
        })
            .done(function (response) {
                const actual = construirModelo();

                // Si el usuario siguió escribiendo, esta respuesta está obsoleta:
                // se validará de nuevo en el próximo disparador.
                if (actual.texto !== textoEnviado) {
                    return;
                }

                pintar(response.matches || [], actual);
                ultimoTextoValidado = textoEnviado;
            })
            .fail(function (jq, status) {
                if (status !== 'abort') {
                    console.warn('Error al validar ortografía:', status);
                }
            });
    }

    /* ------------------------------------------------------------------
     * Menú de sugerencias
     * ------------------------------------------------------------------ */
    function abrirMenu(err) {
        errorActivo = err;
        $menu.empty();

        if (err.mensaje) {
            $('<div class="lt-mensaje">').text(err.mensaje).appendTo($menu);
        }

        if (err.sugerencias.length) {

            err.sugerencias.forEach(function (valor) {
                $('<button type="button" class="lt-sugerencia">')
                    .text(valor) // .text() evita inyección de HTML
                    .on('click', function () {
                        reemplazar(valor);
                    })
                    .appendTo($menu);
            });

        } else {

            $('<div class="lt-vacio">').text('Sin sugerencias').appendTo($menu);

            $('<button type="button" class="lt-accion">')
                .text('✏️ Corregir manualmente')
                .on('click', corregirManualmente)
                .appendTo($menu);

            $('<button type="button" class="lt-accion">')
                .text('🚫 Ignorar "' + err.rango.toString() + '"')
                .on('click', ignorar)
                .appendTo($menu);
        }

        const rect = err.rango.getBoundingClientRect();

        $menu.css({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX
        }).show();
    }

    function cerrarMenu() {
        errorActivo = null;
        $menu.hide().empty();
    }

    function reemplazar(valor) {
        const err = errorActivo;

        if (!err || err.rango.collapsed) {
            cerrarMenu();
            return;
        }

        editor.focus();

        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(err.rango.cloneRange());

        quitarError(err);

        // insertText reemplaza la selección, deja el cursor al final
        // de la palabra y conserva el historial de deshacer (Ctrl+Z)
        const ok = document.execCommand('insertText', false, valor);

        if (!ok) {
            const r = sel.getRangeAt(0);
            r.deleteContents();

            const nodo = document.createTextNode(valor);
            r.insertNode(nodo);
            r.setStartAfter(nodo);
            r.collapse(true);

            sel.removeAllRanges();
            sel.addRange(r);

            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }

        cerrarMenu();
    }

    /* Selecciona la palabra completa: lo que el usuario escriba la reemplaza */
    function corregirManualmente() {
        const err = errorActivo;

        if (!err || err.rango.collapsed) {
            cerrarMenu();
            return;
        }

        editor.focus();

        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(err.rango.cloneRange());

        quitarError(err);
        cerrarMenu();
    }

    /* Deja de marcar la palabra en todo el texto mientras la página esté abierta */
    function ignorar() {
        const err = errorActivo;

        if (!err) {
            cerrarMenu();
            return;
        }

        const palabra = err.rango.toString().toLowerCase();
        ignoradas.add(palabra);

        errores
            .filter(e => e.rango.toString().toLowerCase() === palabra)
            .forEach(quitarError);

        cerrarMenu();
        editor.focus();
    }

    /* ------------------------------------------------------------------
     * Eventos
     * ------------------------------------------------------------------ */

    /* true si el cambio fue Space, Enter, Shift+Enter o Pegar */
    function debeValidar(e) {
        const original = e.originalEvent || {};
        const tipo = original.inputType || '';
        const dato = original.data;

        const esEspacio = tipo === 'insertText' && (dato === ' ' || dato === '\u00A0');
        const esEnter = tipo === 'insertParagraph' || tipo === 'insertLineBreak';
        const esPegar = tipo === 'insertFromPaste';

        return esEspacio || esEnter || esPegar;
    }

    function alEscribir(e) {
        cerrarMenu();

        // Si el usuario está corrigiendo una palabra marcada a mano, se desmarca
        const err = errorEnCursor();
        if (err) {
            quitarError(err);
        }

        // Rangos que quedaron vacíos porque se borró su texto
        errores.filter(e => e.rango.collapsed).forEach(quitarError);

        if (debeValidar(e)) {
            clearTimeout(timer);
            timer = setTimeout(validar, DEBOUNCE_MS);
        }
    }

    /* Al salir del editor se valida de inmediato (revisa la última palabra) */
    function alSalir() {
        clearTimeout(timer);
        validar();
    }

    function init(opciones) {
        editor = document.querySelector(opciones.editor);
        $menu = $(opciones.menu);
        url = opciones.url;

        if (!editor) {
            console.error('CorrectorOrtografico: no se encontró el editor');
            return;
        }

        if (highlight) {
            CSS.highlights.set('lt-error', highlight);
        } else {
            console.warn('El navegador no soporta CSS Custom Highlight API: no se mostrarán subrayados.');
        }

        $(editor).on('input', alEscribir);

        $(editor).on('blur', alSalir);

        $(editor).on('click', function () {
            const err = errorEnCursor();
            err ? abrirMenu(err) : cerrarMenu();
        });

        $(editor).on('scroll', cerrarMenu);

        // Evita que el editor pierda el foco al hacer clic en el menú
        $menu.on('mousedown', function (e) {
            e.preventDefault();
        });

        $(document).on('mousedown', function (e) {
            if (!$menu.is(e.target) && !$menu.has(e.target).length && e.target !== editor && !editor.contains(e.target)) {
                cerrarMenu();
            }
        });

        $(document).on('keydown', function (e) {
            if (e.key === 'Escape') {
                cerrarMenu();
            }
        });
    }

    return {
        init: init,
        validar: validar
    };

})(jQuery);

$(function () {
    CorrectorOrtografico.init({
        editor: '#editor',
        menu: '#menu',
        url: 'check.php'
    });
});