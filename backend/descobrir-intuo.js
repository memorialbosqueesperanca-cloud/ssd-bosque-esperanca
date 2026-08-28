const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const axios = require('axios');

const INTUO_URL = 'https://api-bosquedaesperanca.intuo.app/iVertexServices/DataAdminDIO/ListarConsultasDisponiveis';
const INTUO_TOKEN = process.env.INTUO_TOKEN;

async function descobrirDataSets() {
    try {
        console.log("🔎 Buscando e filtrando DataSets na INTUO...");

        const response = await axios.get(INTUO_URL, {
            headers: {
                'token': INTUO_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.Status === 0) {
            const todosDataSets = response.data.ResponseData;

            const palavrasChave = ["agenda", "cerimonial", "sala", "velório", "atendimento", "contato", "tipo", "sepultamento"];

            const filtrados = todosDataSets.filter(dataset => {
                const nome = dataset.NomeCompleto ? dataset.NomeCompleto.toLowerCase() : "";
                const menu = dataset.Menu ? dataset.Menu.toLowerCase() : "";

                return palavrasChave.some(palavra => nome.includes(palavra) || menu.includes(palavra));
            });

            console.log("\n✅ DATASETS ENCONTRADOS PARA A INTEGRAÇÃO:");
            console.log(JSON.stringify(filtrados, null, 2));
            console.log(`\nTotal filtrado: ${filtrados.length} DataSets.`);
        } else {
            console.log("⚠️ A API respondeu com erro interno:", response.data);
        }

    } catch (error) {
        console.error("❌ Erro na requisição:", error.message);
    }
}

descobrirDataSets();
