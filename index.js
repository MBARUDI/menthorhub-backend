const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
// O Render define a porta automaticamente na variável process.env.PORT
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors()); // Libera acesso para seu site

// --- CONFIGURAÇÃO ---
// DICA: O ideal é usar Variáveis de Ambiente no Render para esconder o Token,
// mas para testar agora, pode colocar direto aqui.
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-2938703960226653-120815-b11dd2f1ea41c941cd6c43a535eb3bde-3050160102UI' 
});

// Rota de Criação do Pix
app.post('/create-payment', async (req, res) => {
    const { payerEmail, payerName } = req.body;
    try {
        const payment = new Payment(client);
        const body = {
            transaction_amount: 19.90,
            description: 'Acesso Premium MenthorHub',
            payment_method_id: 'pix',
            payer: {
                email: payerEmail,
                first_name: payerName || 'Cliente'
            },
            // AQUI VOCÊ VAI COLOCAR A URL DO RENDER DEPOIS DE CRIAR LÁ
            notification_url: 'https://menthorhub-backend.onrender.com/webhooks/mercadopago'
        };
        const result = await payment.create({ body });
        res.status(200).json({
            id: result.id,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar Pix' });
    }
});

// Rota do Webhook
app.post('/webhooks/mercadopago', async (req, res) => {
    const { type, data } = req.body;
    res.status(200).send('OK'); // Responde rápido

    if (type === 'payment') {
        // Aqui entra sua lógica de verificar status e liberar o código
        console.log("Notificação recebida:", data.id);
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});