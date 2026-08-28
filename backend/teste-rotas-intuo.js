const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const axios = require('axios');

const baseURL = (process.env.INTUO_URL || '').replace(/\/$/, '');
const token = process.env.INTUO_TOKEN;

const rotas = [
  //'/iVertexServices/DataAdminDIO/ListarConsultasDisponiveis',
  //'/iVertexServices/DataAdminDIO/ListarConsultasDisponiveis/',
  //'/iVertexServices/AdministracaoDados/ExecutarDataSet',
  '/iVertexServices/AdministracaoDados/ObterDadosConsulta?id=605'

//'/iVertexServices/DataAdminDIO/ListarConsultasDisponiveis?id=605'
];

async function testarRotas() {
  for (const rota of rotas) {
    const url = `${baseURL}${rota}`;
    console.log(`\nTentando: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: {
          token,
          'Content-Type': 'application/json'
        }
      });

      console.log(JSON.stringify(response.data, null, 2));
      return;
    } catch (error) {
      console.log('status:', error.response?.status || 'sem-status');
      console.log(JSON.stringify(error.response?.data || error.message, null, 2));
    }
  }
}

testarRotas();
