const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const axios = require('axios');

const DATASET_ID = 4885; // Consulta Genérica de Atendimentos
const INTUO_BASE_URL = `${(process.env.INTUO_URL || 'https://api-bosquedaesperanca.intuo.app').replace(/\/$/, '')}/iVertexServices/`;
const INTUO_TOKEN = process.env.INTUO_TOKEN;

async function buscarDataset() {
    const response = await axios.get(`${INTUO_BASE_URL}DataAdminDIO/ListarConsultasDisponiveis`, {
        headers: {
            token: INTUO_TOKEN,
            'Content-Type': 'application/json'
        }
    });

    const payload = response.data;
    const datasets = Array.isArray(payload)
        ? payload
        : (payload?.ResponseData || payload?.Conteudo || payload?.Data || []);

    return datasets.find(item => String(item.Id) === String(DATASET_ID) || String(item.IdDataSet) === String(DATASET_ID));
}

async function descobrirParametros() {
    try {
        console.log(`🔎 Buscando o dataset ${DATASET_ID} e os parâmetros da consulta...`);

        const dataset = await buscarDataset();

        if (dataset) {
            console.log("\n✅ DADOS DO DATASET ENCONTRADOS:");
            console.log(JSON.stringify(dataset, null, 2));
            console.log(`\nQuantidade de parâmetros informada pela API: ${dataset.QuantidadeParametros ?? 'N/A'}`);
        } else {
            console.log("⚠️ Não foi possível localizar o dataset 124 na resposta da API.");
        }

        const url = `${INTUO_BASE_URL}DataAdminDIO/ListarParametrosConsulta/${DATASET_ID}`;
        console.log(`\nTentando rota documentada: ${url}`);

        const resposta = await axios.get(url, {
            headers: {
                token: INTUO_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        console.log("\n✅ RESPOSTA DOS PARÂMETROS:");
        console.log(JSON.stringify(resposta.data, null, 2));
    } catch (error) {
        console.error("❌ Erro na requisição:", error.message);
        if (error.response) {
            console.error("Detalhes do erro:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

descobrirParametros();
