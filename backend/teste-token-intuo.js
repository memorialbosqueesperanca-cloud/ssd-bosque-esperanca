const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const axios = require('axios');

const INTUO_URL = 'https://api-bosquedaesperanca.intuo.app/iVertexServices/DataAdminDIO/ListarConsultasDisponiveis';
const INTUO_TOKEN = process.env.INTUO_TOKEN || 'COLOQUE_AQUI_O_NOVO_TOKEN';

console.log("🔍 Raio-X do Token:");
console.log("Valor:", INTUO_TOKEN ? INTUO_TOKEN.substring(0, 10) + "... (tamanho: " + INTUO_TOKEN.length + ")" : "Vazio / Undefined");

async function testarToken() {
  console.log('🔎 Testando token INTUO...');

  try {
    const response = await axios.get(INTUO_URL, {
      headers: {
        token: INTUO_TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });

    const status = response.data?.Status;
    if (status === 0 || status === 1) {
      console.log('✅ Token válido!');
    } else {
      console.log('⚠️ A API respondeu, mas não aceitou o token.');
    }

    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Erro ao validar token.');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testarToken();
