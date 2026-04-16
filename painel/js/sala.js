const urlParams = new URLSearchParams(window.location.search);
const numeroSala = urlParams.get('numero') || '1';

async function buscarDadosDaSala() {
    try {
        const response = await fetch(`/api/sala/${numeroSala}`);
        const dados = await response.json();

        if (dados.nome === "Sala disponível") {
            document.getElementById('nome').innerText = "SALA EM PREPARAÇÃO";
            document.getElementById('destino-titulo').innerText = "";
            document.getElementById('destino-local').innerText = "";
            document.querySelector('.qrcodes-bloco').style.display = 'none';
            document.querySelector('.datas-vida').style.display = 'none';
            document.querySelector('.horarios-velorio').style.display = 'none';
            document.querySelector('.redes-sociais-bloco').style.display = 'none';
            document.getElementById('foto').src = "https://via.placeholder.com/400?text=Bosque+da+Esperanca";
        } else {
            document.getElementById('nome').innerText = dados.nome;
            document.getElementById('foto').src = dados.foto;
            
            const destinoTitulo = document.getElementById('destino-titulo');
            const destinoLocal = document.getElementById('destino-local');
            
            if (!dados.destino || dados.destino.toLowerCase().includes('crema')) {
                destinoTitulo.innerText = "Cremação";
                destinoLocal.innerText = "Crematório Bosque";
            } else {
                destinoTitulo.innerText = "Sepultamento na Quadra:";
                destinoLocal.innerText = dados.destino;
            }

            document.querySelector('.qrcodes-bloco').style.display = 'flex';
            document.querySelector('.datas-vida').style.display = 'flex';
            document.querySelector('.horarios-velorio').style.display = 'block';
            document.querySelector('.redes-sociais-bloco').style.display = 'flex';

            document.getElementById('hora-inicio').innerText = dados.hora_inicio;
            document.getElementById('hora-termino').innerText = dados.hora_termino;
            document.getElementById('data-nasc').innerText = dados.data_nascimento;
            document.getElementById('data-falec').innerText = dados.data_falecimento;

            // 1. QR Code Memorial (Vem direto do Bubble)
            if (dados.qrCode) {
                document.getElementById('qr-memorial').src = dados.qrCode;
            } else {
                document.getElementById('qr-memorial').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://memorialbosque.com.br`;
            }

            // 2. QR Code Velório On-line (Coloque o link real aqui depois)
            const linkVelorio = "https://velorio.memorialbosque.com.br";
            document.getElementById('qr-velorio').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(linkVelorio)}`;

            // 3. QR Code Redes Sociais (Coloque o link do Linktree/Instagram aqui)
            const linkRedes = "https://instagram.com/bosquedaesperanca";
            document.getElementById('qr-redes').src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(linkRedes)}`;
        }
    } catch (erro) {
        console.error("Erro ao buscar dados da sala:", erro);
    }
}

buscarDadosDaSala();
setInterval(buscarDadosDaSala, 60000); // Atualiza a cada minuto
