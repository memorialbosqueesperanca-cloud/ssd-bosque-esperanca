const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const base = (process.env.INTUO_URL || 'https://api-bosquedaesperanca.intuo.app').replace(/\/$/, '');
const token = process.env.INTUO_TOKEN;

(async () => {
  const res = await axios.get(`${base}/iVertexServices/DataAdminDIO/ListarConsultasDisponiveis`, {
    headers: {
      token,
      'Content-Type': 'application/json'
    }
  });

  const data = res.data;
  const items = Array.isArray(data) ? data : (data.ResponseData || data.Conteudo || data.Data || []);

  console.log(`TOTAL=${items.length}`);
  for (const item of items) {
    console.log(`${item.Id} | ${item.Modulo} | ${item.Menu} | ${item.NomeResumido}`);
  }
})().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
