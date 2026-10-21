// Ponto de entrada do servidor (PM2 e uso direto): node servidor/iniciar.mjs
// Variáveis: PORT (3031), HOST (127.0.0.1), FAROL_DB (servidor/dados/farol.db), FAROL_ESTATICO=1 para servir jogo/ junto
import { criarApp } from "./app.mjs";

const PORT = Number(process.env.PORT || 3031), HOST = process.env.HOST || "127.0.0.1";
const { servidor, db } = await criarApp();
servidor.listen(PORT, HOST, () => console.log(`Farol API em http://${HOST}:${PORT} (banco: ${db.motor})`));
const parar = () => servidor.close(() => process.exit(0));
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
