require('dotenv').config(); // Carrega variáveis se existir arquivo .env (local)
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

// --- 1. CONFIGURAÇÕES E VALIDAÇÃO ---
const supabaseUrl = process.env.SUPABASE_URL; 
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const accessToken = process.env.MP_ACCESS_TOKEN;
const notificationUrl = process.env.NOTIFICATION_URL;

// Verifica se tudo está configurado antes de iniciar
if (!supabaseUrl || !supabaseKey || !accessToken) {
    console.error("❌ ERRO CRÍTICO: Faltam variáveis de ambiente no Render!");
    console.error("Verifique: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN");
    process.exit(1); // Encerra o servidor se faltar configuração
}

// --- 2. INICIALIZAÇÃO ---
const supabase = createClient(supabaseUrl, supabaseKey);
const client = new MercadoPagoConfig({ accessToken });

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// --- 3. ROTA: CRIAR PIX ---
app.post('/create-payment', async (req, res) => {
    const { payerEmail, payerName } = req.body;
    
    // Validação básica
    if (!payerEmail) {
        return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    console.log(`📝 Criando novo Pix para: ${payerEmail}`);

    try {
        const payment = new Payment(client);
        
        const body = {
            transaction_amount: 19.90, // Defina o preço do seu produto
            description: 'Acesso Premium MenthorHub',
            payment_method_id: 'pix',
            payer: {
                email: payerEmail,
                first_name: payerName || 'Cliente'
            },
            notification_url: notificationUrl
        };

        const result = await payment.create({ body });

        // Retorna os dados para o Frontend gerar o QR Code
        res.status(200).json({
            id: result.id,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64
        });

    } catch (error) {
        console.error("❌ Erro ao criar Pix:", error);
        res.status(500).json({ error: 'Erro interno ao processar pagamento' });
    }
});

// --- 4. ROTA: WEBHOOK (Onde o Mercado Pago avisa) ---
app.post('/webhooks/mercadopago', async (req, res) => {
    const { type, data } = req.body;
    
    // Responde rápido para o Mercado Pago não ficar reenviando
    res.status(200).send('OK'); 

    if (type === 'payment') {
        console.log(`🔔 Webhook recebido. ID do Pagamento: ${data.id}`);

        try {
            // Consulta o status atualizado no Mercado Pago
            const payment = new Payment(client);
            const paymentData = await payment.get({ id: data.id });

            console.log(`ℹ️ Status do pagamento ${data.id}: ${paymentData.status}`);

            if (paymentData.status === 'approved') {
                const emailCliente = paymentData.payer.email;
                console.log(`✅ Pagamento APROVADO! Liberando acesso para: ${emailCliente}`);

                // Gera token único
                const novoToken = 'MENTHOR-' + Math.random().toString(36).substring(2, 10).toUpperCase();

                // Atualiza no Supabase
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
                    console.log(`🎉 Sucesso! Token gerado: ${novoToken}`);
                }
            }
        } catch (error) {
            console.error("❌ Erro ao processar Webhook:", error);
        }
    }
});

// --- 5. INICIAR SERVIDOR ---
app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
