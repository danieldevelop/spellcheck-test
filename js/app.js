'use strict';

$("#btnValidar").on("click", () => {

    const texto = $("texto").val();

    $.ajax({
        url: "check.php",
        type: "POST",
        data: {
            texto,
        },
        success: (response) => {
            let html = "";

            if (response.matches.length === 0) {
                html += `<p>Sin errores</p>`;
            }

            response.matches.forEach((item) => {
                const palabra = texto.slice(item.offset, item.length);

                html += `
                    <div>
                        <b>Palabra: </b>${palabra}<br />
                        <b>Sugerencias: </b><br />
                `;

                item.replacements.forEach((rep) => {
                    html += `- ${rep.value}<br/>`;
                });

                html += `</div>`;
            });

            $("#resultado").html(html);
        }
    })

});