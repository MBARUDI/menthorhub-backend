require('dotenv').config(); // Carrega variáveis se estiver rodando localmente
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURAÇÕES SEGURAS ---
// O Render vai ler essas variáveis do painel "Environment"
const supabaseUrl = process.env.SUPABASE_URL; 
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const accessToken = process.env.MP_ACCESS_TOKEN;
const notificationUrl = process.env.NOTIFICATION_URL;

// Validação simples para evitar erros de inicialização
if (!supabaseUrl || !supabaseKey || !accessToken || !notificationUrl) {
    console.error("❌ ERRO CRÍTICO: Variáveis de ambiente faltando!");
    process.exit(1);
}

// --- INICIALIZAÇÃO DOS CLIENTES ---
const supabase = createClient(supabaseUrl, supabaseKey);
const client = new MercadoPagoConfig({ accessToken });

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// --- ROTA DE CRIAÇÃO DO PIX ---
app.post('/create-payment', async (req, res) => {
    const { payerEmail, payerName } = req.body;
    
    // --- VALIDAÇÃO DE ENTRADA ---
    // Garante que o e-mail foi fornecido antes de chamar a API do Mercado Pago
    if (!payerEmail) {
        console.warn("⚠️ Tentativa de pagamento sem e-mail.");
        return res.status(400).json({ error: 'O e-mail do pagador é obrigatório.' });
    }

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
            notification_url: notificationUrl
        };

        const result = await payment.create({ body });

        res.status(200).json({
            id: result.id,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64
        });

    } catch (error) {
        // Log detalhado para depuração no servidor (Render)
        console.error("❌ Erro ao criar pagamento PIX:", error?.cause ?? error);

        // Resposta de erro mais informativa para o frontend
        // Se o erro for da API do MP, ele pode conter detalhes úteis
        const errorMessage = error.cause?.error?.message || 'Erro interno ao processar pagamento';
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: errorMessage });
    }
});

// --- ROTA DO WEBHOOK ---
app.post('/webhooks/mercadopago', async (req, res) => {
    const { type, data } = req.body;
    res.status(200).send('OK'); // Responde OK imediatamente

    if (type === 'payment') {
        console.log(`🔔 Notificação recebida. ID: ${data.id}`);

        try {
            // 1. Busca o status real no Mercado Pago
            const payment = new Payment(client);
            const paymentData = await payment.get({ id: data.id });

            // 2. Verifica se foi APROVADO
            if (paymentData.status === 'approved') {
                const emailCliente = paymentData.payer.email;
                console.log(`✅ Pagamento aprovado para: ${emailCliente}`);

                // 3. Gera Token e Libera no Supabase
                const novoToken = 'MENTHOR-' + Math.random().toString(36).substring(2, 10).toUpperCase();

                const { error } = await supabase
                    .from('loginmenthorhubai')
                    .update({ 
                        is_paid: true, 
                        token: novoToken 
                    })
                    .eq('email', emailCliente);

                if (error) {
                    console.error("❌ Erro ao salvar no Supabase:", error);
                } else {
                    console.log("🎉 Acesso liberado com sucesso!");
                }
            }
        } catch (error) {
            console.error("Erro no processamento do Webhook:", error);
        }
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});