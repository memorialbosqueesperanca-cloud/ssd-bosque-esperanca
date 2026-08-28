const assert = require('assert');

// 1. Simulando a lógica exata de merge do server.js
function mergeDados(dadosBubble, dadosIVertex) {
    const listaCruzada = [];
    const chavesProcessadas = new Set();

    // Função para extrair apenas o número da sala (ex: "Sala 1" vira "1"). 
    // Mapeia "Imersiva" (Bubble) para "3" (iVertex).
    const normalizarSala = (sala) => {
        let s = String(sala || "").toLowerCase();
        if (s.includes('imersiva')) return '3';
        return s.replace(/\D/g, '') || s;
    };

    // PASSO 1: Processa Bubble
    dadosBubble.forEach(item => {
        const nomeFalecido = item.falecido_nome || "Homenageado";
        const salaDesignada = item.sala_cerimonia || "-";
        const chave = `${nomeFalecido.toLowerCase()}-${normalizarSala(salaDesignada)}`;

        if (!chavesProcessadas.has(chave)) {
            chavesProcessadas.add(chave);
            
            listaCruzada.push({
                nome: nomeFalecido,
                sala: salaDesignada,
                foto: item["Foto falecido"] ? (item["Foto falecido"].startsWith('//') ? `https:${item["Foto falecido"]}` : item["Foto falecido"]) : null,
                destino: item["local da sepultura"] || "Consulte a recepção",
                data_inicio: item.data_inicio,
                data_fim: item.data_fim
            });
        }
    });

    // PASSO 2: Processa iVertex
    if (Array.isArray(dadosIVertex)) {
        dadosIVertex.forEach(itemIVertex => {
            const nomeFalecido = itemIVertex.nome || "Homenageado";
            const salaDesignada = itemIVertex.sala_id ? itemIVertex.sala_id : (itemIVertex.tipo_servico || "Direto");
            const chave = `${nomeFalecido.toLowerCase()}-${normalizarSala(salaDesignada)}`;

            if (!chavesProcessadas.has(chave)) {
                chavesProcessadas.add(chave);

                listaCruzada.push({
                    nome: nomeFalecido,
                    sala: salaDesignada,
                    foto: null,
                    destino: itemIVertex.local_sepultura || "Consulte a recepção",
                    data_inicio: itemIVertex.data_inicio,
                    data_fim: itemIVertex.data_fim
                });
            }
        });
    }

    return listaCruzada;
}

// ==========================================
// 2. DADOS MOCKADOS (CENÁRIOS DE TESTE)
// ==========================================
const agora = new Date().toISOString();

// Cenário 1: João está em ambos os sistemas
const mockBubble1 = [{ falecido_nome: "João da Silva", sala_cerimonia: "Sala 1", "Foto falecido": "//site.com/foto.jpg", "local da sepultura": "Quadra 5", data_inicio: agora, data_fim: agora }];
const mockIVertex1 = [{ nome: "João da Silva", sala_id: "1", local_sepultura: "Q5 L10", data_inicio: agora, data_fim: agora }];

// Cenário 2: Maria está APENAS no iVertex (Serviço direto/sem memorial)
const mockBubble2 = [];
const mockIVertex2 = [{ nome: "Maria Oliveira", tipo_servico: "Cremação Direta", local_sepultura: "Cremação", data_inicio: agora, data_fim: agora }];

// Cenário 3: Carlos está APENAS no Bubble
const mockBubble3 = [{ falecido_nome: "Carlos Santos", sala_cerimonia: "Sala 3", "local da sepultura": "Quadra 2", data_inicio: agora, data_fim: agora }];
const mockIVertex3 = [];

// Cenário 5: Homônimos (Mesmo nome, porém em salas diferentes)
const mockBubble5 = [{ falecido_nome: "José da Costa", sala_cerimonia: "Sala 2", "local da sepultura": "Quadra 1", data_inicio: agora, data_fim: agora }];
const mockIVertex5 = [{ nome: "José da Costa", sala_id: "4", local_sepultura: "Q1 L1", data_inicio: agora, data_fim: agora }];

// Cenário 6: Sala Imersiva no Bubble x Sala 3 no iVertex
const mockBubble6 = [{ falecido_nome: "Ana Beatriz", sala_cerimonia: "Sala Imersiva", "local da sepultura": "Quadra 7", data_inicio: agora, data_fim: agora }];
const mockIVertex6 = [{ nome: "Ana Beatriz", sala_id: "3", local_sepultura: "Q7 L2", data_inicio: agora, data_fim: agora }];

// ==========================================
// 3. EXECUÇÃO DOS TESTES E VALIDAÇÕES
// ==========================================
console.log("Iniciando testes de cruzamento de dados (Merge Bubble + iVertex)...\n");

try {
    // Teste 1: Prevenção de conflitos (Prioridade Bubble)
    const res1 = mergeDados(mockBubble1, mockIVertex1);
    assert.strictEqual(res1.length, 1, "Erro no Cenário 1: Deveria haver apenas 1 registro (sem duplicatas)");
    assert.strictEqual(res1[0].nome, "João da Silva", "Erro no Cenário 1: Nome incorreto");
    assert.strictEqual(res1[0].sala, "Sala 1", "Erro no Cenário 1: Sala deveria vir do Bubble");
    assert.strictEqual(res1[0].foto, "https://site.com/foto.jpg", "Erro no Cenário 1: Foto deveria ser ajustada com https");
    console.log("✅ Cenário 1 (Presente em ambos) processado com sucesso. Duplicata evitada!");

    // Teste 2: Fallback para o iVertex
    const res2 = mergeDados(mockBubble2, mockIVertex2);
    assert.strictEqual(res2.length, 1, "Erro no Cenário 2: Deveria haver 1 registro do iVertex");
    assert.strictEqual(res2[0].sala, "Cremação Direta", "Erro no Cenário 2: Fallback da sala falhou");
    console.log("✅ Cenário 2 (Apenas no iVertex) processado com sucesso.");

    // Teste 3: Leitura isolada do Bubble
    const res3 = mergeDados(mockBubble3, mockIVertex3);
    assert.strictEqual(res3.length, 1, "Erro no Cenário 3: Deveria haver 1 registro do Bubble");
    console.log("✅ Cenário 3 (Apenas no Bubble) processado com sucesso.");

    // Teste 4: Mix global (Todos juntos simultaneamente)
    const res4 = mergeDados([...mockBubble1, ...mockBubble3], [...mockIVertex1, ...mockIVertex2]);
    assert.strictEqual(res4.length, 3, "Erro no Cenário 4: Deveriam resultar em exatos 3 homenageados únicos");
    console.log("✅ Cenário 4 (Mistura global sem conflitos) processado com sucesso.");

    // Teste 5: Homônimos com dupla verificação (Nome + Sala)
    const res5 = mergeDados(mockBubble5, mockIVertex5);
    assert.strictEqual(res5.length, 2, "Erro no Cenário 5: Deveria haver 2 registros distintos para homônimos");
    console.log("✅ Cenário 5 (Homônimos em salas diferentes) processado. O cruzamento duplo funcionou!");

    // Teste 6: Sala Imersiva
    const res6 = mergeDados(mockBubble6, mockIVertex6);
    assert.strictEqual(res6.length, 1, "Erro no Cenário 6: Deveria haver apenas 1 registro (Imersiva = Sala 3)");
    assert.strictEqual(res6[0].sala, "Sala Imersiva", "Erro no Cenário 6: O nome da sala exibido deveria ser o do Bubble");
    console.log("✅ Cenário 6 (Sala Imersiva mapeada para Sala 3) processado com sucesso.\n\n🎉 Todos os testes passaram!");
} catch (error) {
    console.error("❌ Falha nos testes:", error.message);
}