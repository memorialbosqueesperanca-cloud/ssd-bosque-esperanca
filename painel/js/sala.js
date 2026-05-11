const urlParams = new URLSearchParams(window.location.search);
const numeroSala = urlParams.get('numero') || '1';
let modoHallAtivo = false;

async function gerenciarTelaSala() {
    try {
        // 1. Verificar localStorage para entradas manuais ativas para esta sala
        let entradaManual = null;
        try {
            const raw = localStorage.getItem('painel_emergencia_dados');
            if (raw) {
                const entradas = JSON.parse(raw);
                const agora = new Date();
                entradaManual = entradas.find(e => {
                    const numeroApenas = String(e.sala).replace(/\D/g, '');
                    const fim = new Date(e.data_fim);
                    return numeroApenas === numeroSala && agora <= fim;
                });
            }
        } catch(err) {
            console.error("Erro ao ler localStorage:", err);
        }

        if (entradaManual) {
            const hi = new Date(entradaManual.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const hf = new Date(entradaManual.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            const dadosManual = {
                status: "ocupado",
                nome: entradaManual.nome || "Homenageado",
                foto: entradaManual.foto,
                hora_inicio: hi,
                hora_termino: hf,
                data_nascimento: "N/A",
                data_falecimento: "N/A",
                destino: entradaManual.destino || "Cremação",
                data_fim_raw: entradaManual.data_fim
            };
            exibirDadosDoMemorial(dadosManual);
            return;
        }

        const response = await fetch(`/api/sala/${numeroSala}`);
        const dados = await response.json();
        const agora = new Date();

        if (dados.status === "disponivel" || (dados.data_fim_raw && agora > new Date(dados.data_fim_raw))) {
            if (!modoHallAtivo) {
                modoHallAtivo = true;
                iniciarModoHallNaSala();
            }
        } else {
            exibirDadosDoMemorial(dados);
        }
    } catch (erro) {
        console.error("Erro ao gerenciar tela:", erro);
    }
}

function exibirDadosDoMemorial(dados) {
    modoHallAtivo = false;

    const containerHall = document.getElementById('container-hall-sala');
    if (containerHall) containerHall.style.display = 'none';
    
    const content = document.querySelector('.sala-content');
    if (content) content.style.display = 'flex';

    document.getElementById('nome').innerText = dados.nome;
    document.getElementById('foto').src = dados.foto || "videos/logo_bosque.png";
    document.getElementById('hora-inicio').innerText = dados.hora_inicio;
    document.getElementById('hora-termino').innerText = dados.hora_termino;
    document.getElementById('data-nasc').innerText = dados.data_nascimento;
    document.getElementById('data-falec').innerText = dados.data_falecimento;
    let destinoFormatado = dados.destino || "Cremação";
    if (destinoFormatado.toLowerCase() === "consulte a recepção" || !destinoFormatado.toLowerCase().includes("quadra")) {
        destinoFormatado = "Cremação";
    } else {
        let temp = destinoFormatado.replace(/quadra/gi, '').trim();
        temp = temp.replace(/^[:\-,\s]+/, '');
        destinoFormatado = "Quadra " + temp;
    }
    document.getElementById('destino-local').innerText = destinoFormatado;

    // QR Code Redes Sociais
    const linkRedes = "https://linktr.ee/bosquedaesperanca";
    const elQrRedes = document.getElementById('qr-redes');
    if (elQrRedes && !elQrRedes.src.includes('api.qrserver.com')) {
        elQrRedes.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(linkRedes)}`;
    }

    // QR Codes com prioridade: Flora > Memorial > Velório Online
    const elQrMemorial = document.getElementById('qr-memorial');
    const elQrVelorio = document.getElementById('qr-velorio');
    const qrItemMemorial = elQrMemorial ? elQrMemorial.parentElement : null;
    const qrItemVelorio = elQrVelorio ? elQrVelorio.parentElement : null;

    const hasMemorial = !dados.is_ivertex_only;
    const hasVelorioOnline = !!dados.velorio_online;

    const urlFlora = "https://bosqueesperanca.com.br/flora/";
    const qrFlora = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlFlora)}`;
    const qrMemorialUrl = dados.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://memorialbosque.com.br`;
    
    const linkVelorio = (typeof dados.velorio_online === 'string' && dados.velorio_online.length > 5) ? dados.velorio_online : "https://www.adiau.com.br/embed/?hash=beFS6qSdk8HJKlKV5gqzYh93#!";
    const qrVelorioUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(linkVelorio)}`;

    if (qrItemMemorial && qrItemVelorio) {
        // Definir prioridades: Flora > Memorial > Velório Online
        const qrsDisponiveis = [];
        if (true) qrsDisponiveis.push({ tipo: 'flora', url: qrFlora, titulo: 'FLORA' }); // Flora sempre disponível
        if (hasMemorial) qrsDisponiveis.push({ tipo: 'memorial', url: qrMemorialUrl, titulo: 'MEMORIAL' });
        if (hasVelorioOnline) qrsDisponiveis.push({ tipo: 'velorio', url: qrVelorioUrl, titulo: 'VELÓRIO ON-LINE' });

        // Mostrar até 2 QR codes na ordem de prioridade
        if (qrsDisponiveis.length === 0) {
            qrItemMemorial.style.display = 'none';
            qrItemVelorio.style.display = 'none';
        } else if (qrsDisponiveis.length === 1) {
            qrItemMemorial.style.display = 'flex';
            qrItemVelorio.style.display = 'none';
            elQrMemorial.src = qrsDisponiveis[0].url;
            qrItemMemorial.querySelector('.qr-titulo').innerText = qrsDisponiveis[0].titulo;
        } else {
            qrItemMemorial.style.display = 'flex';
            qrItemVelorio.style.display = 'flex';
            elQrMemorial.src = qrsDisponiveis[0].url;
            qrItemMemorial.querySelector('.qr-titulo').innerText = qrsDisponiveis[0].titulo;
            elQrVelorio.src = qrsDisponiveis[1].url;
            qrItemVelorio.querySelector('.qr-titulo').innerText = qrsDisponiveis[1].titulo;
        }
    }
}

function iniciarModoHallNaSala() {
    const content = document.querySelector('.sala-content');
    if (content) content.style.display = 'none';
    
    let containerHall = document.getElementById('container-hall-sala');
    if (!containerHall) {
        containerHall = document.createElement('iframe');
        containerHall.id = 'container-hall-sala';
        containerHall.src = '/index.html?modo=sala'; 
        containerHall.setAttribute('allow', 'autoplay');
        containerHall.style.width = '100%';
        containerHall.style.height = '94vh';
        containerHall.style.border = 'none';
        containerHall.style.position = 'absolute';
        containerHall.style.top = '3vh';
        containerHall.style.left = '0';
        containerHall.style.zIndex = '10';
        containerHall.style.backgroundColor = '#ffffff';
        document.body.appendChild(containerHall);
    }
    containerHall.style.display = 'block';
}

// TELA CHEIA
document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
});

setInterval(gerenciarTelaSala, 60000);
gerenciarTelaSala();
