// PM2: pm2 start servidor/ecosystem.config.cjs  (rodar dentro de /var/www/farol)
module.exports = {
  apps: [{
    name: "farol-api",
    script: "servidor/iniciar.mjs",
    cwd: "/var/www/farol",
    env: {
      NODE_ENV: "production",
      PORT: 3031,
      HOST: "127.0.0.1",
      FAROL_DB: "/var/www/farol-dados/farol.db"   // fora do repositório: o git pull nunca mexe nos dados
    },
    max_memory_restart: "300M",
    time: true
  }]
};
