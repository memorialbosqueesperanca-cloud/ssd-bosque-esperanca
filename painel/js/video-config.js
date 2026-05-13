const VIDEO_CONFIG_URL = '/api/video-config';
const VIDEO_UPLOAD_URL = '/api/video-upload';
const DEFAULT_VIDEOS_HALL = ['videos/video1.mp4', 'videos/video2.mp4'];
const DEFAULT_VIDEOS_SALA = ['videos/video-sala1.mp4', 'videos/video-sala2.mp4'];

let videoConfigState = {
    hall: [],
    sala: []
};

async function fetchVideoConfig() {
    try {
        const response = await fetch(VIDEO_CONFIG_URL);
        if (!response.ok) throw new Error('Falha ao carregar configuração do servidor');
        const config = await response.json();
        return {
            hall: Array.isArray(config.hall) && config.hall.length > 0 ? config.hall : DEFAULT_VIDEOS_HALL,
            sala: Array.isArray(config.sala) && config.sala.length > 0 ? config.sala : DEFAULT_VIDEOS_SALA
        };
    } catch (err) {
        console.warn('Falha ao carregar configuração de vídeos:', err);
        return { hall: DEFAULT_VIDEOS_HALL, sala: DEFAULT_VIDEOS_SALA };
    }
}

function preencherFormulario(config) {
    videoConfigState = {
        hall: [...config.hall],
        sala: [...config.sala]
    };
    renderizarVideos();
}

function renderizarVideos() {
    const renderLista = (alvo, lista) => {
        const container = document.getElementById(`visual-videos-${alvo}`);
        if (!container) return;
        container.innerHTML = '';
        if (lista.length === 0) {
            container.innerHTML = '<p class="empty-list" style="color: var(--texto-claro);">Nenhum vídeo configurado.</p>';
            return;
        }
        lista.forEach((caminho, index) => {
            const card = document.createElement('div');
            card.className = 'video-card';
            
            const vid = document.createElement('video');
            vid.src = caminho;
            vid.className = 'video-thumbnail';
            vid.muted = true;
            vid.preload = 'metadata';
            vid.onloadedmetadata = () => { vid.currentTime = 1; }; // Capturar um frame não preto
            
            const info = document.createElement('div');
            info.className = 'video-info';
            
            const title = document.createElement('span');
            title.className = 'video-path';
            title.title = caminho;
            title.textContent = caminho.split('/').pop() || caminho;
            
            const actions = document.createElement('div');
            actions.className = 'video-actions';

            const btnSubstituir = document.createElement('button');
            btnSubstituir.type = 'button';
            btnSubstituir.className = 'btn-replace-video';
            btnSubstituir.innerHTML = 'Substituir';
            btnSubstituir.onclick = () => substituirVideo(alvo, index);

            const btnExcluir = document.createElement('button');
            btnExcluir.type = 'button';
            btnExcluir.className = 'btn-delete-video';
            btnExcluir.innerHTML = 'Remover';
            btnExcluir.onclick = () => removerVideo(alvo, index);
            
            actions.appendChild(btnSubstituir);
            actions.appendChild(btnExcluir);
            info.appendChild(title);
            info.appendChild(actions);
            card.appendChild(vid);
            card.appendChild(info);
            container.appendChild(card);
        });
    };
    renderLista('hall', videoConfigState.hall);
    renderLista('sala', videoConfigState.sala);
}

function mostrarMensagem(texto, sucesso = true) {
    const mensagemEl = document.getElementById('config-message');
    if (!mensagemEl) return;
    mensagemEl.textContent = texto;
    mensagemEl.style.backgroundColor = sucesso ? '#d1e7dd' : '#f8d7da';
    mensagemEl.style.color = sucesso ? '#0f5132' : '#842029';
    mensagemEl.style.border = `1px solid ${sucesso ? '#badbcc' : '#f5c2c7'}`;

    setTimeout(() => {
        if (mensagemEl.textContent === texto) {
            mensagemEl.textContent = '';
            mensagemEl.style.backgroundColor = 'transparent';
            mensagemEl.style.border = 'none';
        }
    }, 5000);
}

function substituirVideo(alvo, index) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm,video/quicktime';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('videoFile', file);
        
        mostrarMensagem('Enviando vídeo para substituição...', true);
        
        try {
            const response = await fetch(VIDEO_UPLOAD_URL, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    videoConfigState[alvo][index] = result.path;
                    renderizarVideos();
                    mostrarMensagem('Vídeo substituído com sucesso!', true);
                } else {
                    mostrarMensagem(result.erro || 'Erro ao substituir o vídeo.', false);
                }
            } else {
                mostrarMensagem('Falha no upload da substituição.', false);
            }
        } catch (err) {
            mostrarMensagem('Erro de conexão ao substituir o vídeo.', false);
        }
    };
    input.click();
}

function removerVideo(alvo, index) {
    if (confirm('Deseja realmente remover este vídeo da lista?')) {
        videoConfigState[alvo].splice(index, 1);
        renderizarVideos();
    }
}

async function restaurarPadrao() {
    const config = { hall: DEFAULT_VIDEOS_HALL, sala: DEFAULT_VIDEOS_SALA };
    const response = await fetch(VIDEO_CONFIG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });

    if (response.ok) {
        preencherFormulario(config);
        mostrarMensagem('Configuração restaurada para os vídeos padrão.', true);
    } else {
        mostrarMensagem('Não foi possível restaurar a configuração.', false);
    }
}

async function salvarFormulario(event) {
    event.preventDefault();

    const hall = videoConfigState.hall;
    const sala = videoConfigState.sala;

    if (hall.length === 0 || sala.length === 0) {
        mostrarMensagem('Adicione ao menos um vídeo para cada lista antes de salvar.', false);
        return;
    }

    const response = await fetch(VIDEO_CONFIG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hall, sala })
    });

    if (response.ok) {
        mostrarMensagem('Configurações salvas com sucesso! Retornando ao Hall...', true);
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    } else {
        mostrarMensagem('Falha ao salvar a configuração do vídeo.', false);
    }
}

async function processarUploadLote(files, target) {
    if (!files || files.length === 0) {
        return;
    }

    const labelTarget = target === 'hall' ? 'Hall Principal' : 'Salas';
    mostrarMensagem(`Enviando ${files.length} vídeo(s) para ${labelTarget}...`, true);
    
    let sucessos = 0;
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('videoFile', files[i]);

        try {
            const response = await fetch(VIDEO_UPLOAD_URL, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    videoConfigState[target].push(result.path);
                    sucessos++;
                }
            }
        } catch (err) {
            console.error('Erro no upload de um arquivo:', err);
        }
    }

    if (sucessos > 0) {
        renderizarVideos();
        mostrarMensagem(`${sucessos} vídeo(s) adicionado(s) com sucesso!`, true);
    } else {
        mostrarMensagem('Erro ao enviar os vídeos selecionados.', false);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const config = await fetchVideoConfig();
    preencherFormulario(config);

    const form = document.getElementById('video-config-form');
    const btnReset = document.getElementById('btn-reset-videos');
    const inputHall = document.getElementById('upload-hall');
    const inputSala = document.getElementById('upload-sala');

    if (form) {
        form.addEventListener('submit', salvarFormulario);
    }

    if (btnReset) {
        btnReset.addEventListener('click', restaurarPadrao);
    }

    if (inputHall) {
        inputHall.addEventListener('change', (e) => {
            processarUploadLote(e.target.files, 'hall');
            e.target.value = ''; // Limpa o input para permitir selecionar o mesmo arquivo novamente
        });
    }

    if (inputSala) {
        inputSala.addEventListener('change', (e) => {
            processarUploadLote(e.target.files, 'sala');
            e.target.value = ''; // Limpa o input
        });
    }
});
