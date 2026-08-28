async function executarPainelSSD() {
    // 1. Gera a data de hoje dinamicamente (Ex: "2026-08-19")
    const dataAtual = new Date().toISOString().split('T')[0];
    const dataFormatadaIntuo = `'${dataAtual}'`; 

    // 2. Monta o payload padrão da Consulta 4885
    const payload = {
        "idConsulta": 4885,
        "usarNomenclaturaBancoDados": true,
        "parametros": [
            { "Item1": "ch_tipo_consulta", "Item2": "ALL" },
            { "Item1": "ch_tipo_filtro_data", "Item2": "ALL" },
            { "Item1": "dt_inicial", "Item2": dataFormatadaIntuo }, 
            { "Item1": "dt_final", "Item2": dataFormatadaIntuo },   
            { "Item1": "ch_texto_pesquisa", "Item2": "" },
            { "Item1": "nm_número_pesquisa", "Item2": "0" },
            { "Item1": "nm_id_usuário", "Item2": "9" },
            { "Item1": "nm_status", "Item2": "0" } 
        ]
    };

    try {
        const urlIntuo = "https://api-bosquedaesperanca.intuo.app/iVertexServices/DataAdminDIO/ObterDadosConsulta"; 
        const tokenIntuo = "7E30CE1DC3D202B0B9A2841694D3EDB44FB7C8"; 

        console.log(`📡 Buscando dados da Intuo para o painel SSD (Data: ${dataAtual})...`);
        
        const resposta = await fetch(urlIntuo, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': tokenIntuo, 
                'token': tokenIntuo
            },
            body: JSON.stringify(payload)
        });

        if (!resposta.ok) {
            const detalheErro = await resposta.text();
            throw new Error(`Erro HTTP: ${resposta.status} - ${detalheErro}`);
        }

        const jsonRetorno = await resposta.json();
        
        if (jsonRetorno.Status !== 0) {
            throw new Error(`Erro da Intuo: ${jsonRetorno.Description}`);
        }

        const todosOsDados = jsonRetorno.ResponseData || [];
        
        // 3. Peneira principal: Velório, Sepultamento e Cremação estritamente de hoje
        const servicosDesejados = ["VELÓRIO", "SEPULTAMENTO", "CREMAÇÃO"];
        
        const dadosFiltrados = todosOsDados.filter(item => {
            const ehServicoDesejado = servicosDesejados.includes(item.ch_nome_tipo);
            const ehDeHoje = item.dt_previsão_início && item.dt_previsão_início.startsWith(dataAtual);
            
            return ehServicoDesejado && ehDeHoje;
        });

        // 4. Cruzamento e Consolidação (Evita duplicados do mesmo homenageado)
        const mapaConsolidado = new Map();

        dadosFiltrados.forEach(item => {
            const homenageado = item.ch_nome_contato_relacionado_atendimento || item.ch_nome_contato_relacionado || "Nome não informado";
            
            // Padroniza a chave pelo nome do homenageado (em maiúsculas para evitar variações de digitação)
            const chave = homenageado.trim().toUpperCase();

            if (!mapaConsolidado.has(chave)) {
                // Se ainda não existe, cria a base
                mapaConsolidado.set(chave, {
                    id_origem: item.nm_id,
                    tipo_servico: item.ch_nome_tipo,
                    homenageado: homenageado,
                    local: item.ch_nome_recurso || "Local não informado",
                    horario_inicio: item.dt_previsão_início,
                    horario_termino: item.dt_previsão_término,
                    status_atual: item.ch_status
                });
            } else {
                // Se já existe, cruzamos os dados para pegar o mais completo
                const registroExistente = mapaConsolidado.get(chave);

                // Prioriza manter um local que não seja genérico (ex: se o atual for "N/D" ou vazio, substitui)
                if ((!registroExistente.local || registroExistente.local === "N/D") && item.ch_nome_recurso) {
                    registroExistente.local = item.ch_nome_recurso;
                }

                // Se o novo registro tiver um status ativo/diferente de cancelado, podemos priorizá-lo
                if (item.ch_status && item.ch_status !== "Cancelado") {
                    registroExistente.status_atual = item.ch_status;
                }
            }
        });

        const servicosFormatados = Array.from(mapaConsolidado.values());

        console.log(`\n✅ Sucesso! Encontrados ${servicosFormatados.length} evento(s) consolidados para hoje (sem duplicados).`);
        console.log("\n👇 Dados prontos para inserção no SQLite / Renderização nas TVs:");
        console.log(JSON.stringify(servicosFormatados, null, 2));

        return servicosFormatados;

    } catch (erro) {
        console.error("\n❌ Falha na requisição:", erro.message);
    }
}

// Executa o script
executarPainelSSD();