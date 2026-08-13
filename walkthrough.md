# Walkthrough - Autocadastro, CRM de Divulgação e Limite Diário

Concluímos com sucesso a implementação de todas as funcionalidades de autocadastro de pais, múltiplos responsáveis, faturamento compartilhado via Pix splits e limites diários no PDV!

---

## 🛠️ Alterações Efetuadas

### 1. Autocadastro de Responsáveis (Backend e Frontend)
* **Backend:** Criada a rota pública `/api/auth/register-guardian` que recebe os dados do pai (Nome, E-mail, Telefone, Senha) e os dados de vínculo do filho (Matrícula e Data de Nascimento). Valida as credenciais do filho, cria o usuário `'guardian'` e realiza login automático.
* **Frontend:** Adicionado o botão **"Primeiro Acesso / Cadastrar-se"** na tela de login de pais. Ao clicar, abre-se um modal amigável e completo para cadastro e vinculação instantânea.

### 2. Múltiplos Responsáveis e Vinculação de Filhos (Self-Service)
* **Backend:** Criada a rota `/api/guardians/me/students` (`POST`) para permitir que um pai já cadastrado vincule outros filhos digitando a Matrícula e Data de Nascimento deles.
* **Frontend:** Adicionado o botão **"+ Vincular Outro Filho"** no Portal de Pais, permitindo o gerenciamento de múltiplos estudantes sob a mesma conta.

### 3. Recargas Online com Pix Compartilhado (Divisão/Splits)
* **Backend:** Atualizados os webhooks da InfinitePay, Mercado Pago e a rota de aprovação manual para ler a propriedade `splits` contida nos metadados do pagamento e creditar individualmente o valor definido para cada filho associado.
* **Frontend:** Se o responsável possuir múltiplos filhos, o modal de recargas exibe a opção **"Recarga Conjunta (Dividir)"**, onde o pai digita quanto deseja destinar a cada filho. O sistema consolida as quantias e gera um único QR Code Pix.
* **Integração InfinitePay Checkout (Autofill):** Atualizado o payload de criação de links de pagamento enviando o objeto `customer` (contendo Nome, E-mail e Telefone em formato E.164) obtido automaticamente do banco de dados (seja pelo responsável logado na recarga ou pela matrícula do aluno no Pix Fiado). Isso faz com que os dados do responsável já venham pré-preenchidos na tela de faturamento da InfinitePay, agilizando muito o processo de pagamento. Inclui verificação de segurança para evitar envio de dados vazios.

### 4. CRM de Divulgação via WhatsApp (Admin)
* **Frontend:** Adicionada a aba **"Painel de Divulgação (CRM)"** no menu de Configurações do painel administrativo. 
* **Funções:**
  * Lista todos os alunos do colégio com filtros e buscas.
  * Exibe um indicador visual se a conta do responsável já está ativa no portal ou pendente.
  * **Nova Coluna "Divulgado?":** Uma caixa de seleção (checkbox) integrada ao banco de dados para marcar manualmente quais alunos já receberam divulgação.
  * **Disparo Automático:** Ao clicar em **"Enviar Zap"**, além de abrir o link do WhatsApp com o template personalizado, o sistema marca a caixa automaticamente no banco de dados. O botão muda para **"Reenviar Zap"** com estilo secundário diferenciado.
  * Fornece um editor do template da mensagem de divulgação do WhatsApp (com placeholders inteligentes `{nome_responsavel}`, `{nome_aluno}`, `{matricula}`, etc.), salvo no navegador.
* **Backend:** Estendido o endpoint `/api/students` para retornar o total de responsáveis ativos (`guardian_count`), os nomes deles (`linked_guardian_names`) e o status `is_marketing_sent` de forma performática. Adicionada a rota `PUT /api/students/:id/marketing` para salvar o status de divulgação.

### 5. Exibição de Limite Diário no PDV (Caixa)
* **Backend:** O endpoint `/api/daily-limits/:studentId` foi enriquecido para calcular o gasto realizado no dia atual e retornar o saldo restante do limite diário do aluno.
* **Frontend:** No PDV, ao bipar ou buscar um aluno que possua limite diário ativo, a informação é exibida no cabeçalho do caixa: `Limite: R$ X,XX (Restante: R$ Y,YY)`, dando visibilidade completa ao operador.

---

## 🧪 Verificação e Builds
* Ambos os projetos **frontend** e **backend** foram compilados com sucesso via `pnpm build`.
* Os testes de banco de dados e transações integradas foram executados e confirmaram a integridade do sistema de pagamentos.
