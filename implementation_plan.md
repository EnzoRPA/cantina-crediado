# Plano de Implementação - Autocadastro, CRM e Limite Diário

Este plano detalha a implementação das melhorias solicitadas para facilitar a divulgação do sistema para os pais, permitir autocadastro seguro com vinculação múltipla de filhos, gerenciar faturamento com Pix compartilhado e exibir limites diários no PDV da cantina.

---

## 🛠️ Alterações Propostas

### 1. Backend: Autocadastro de Responsáveis e Divisão de Pix

#### [NEW] [auth.controller.ts](file:///c:/Users/enzoverzaro/Documents/ANTI-PROJETOS/SISTEMA%20CANTINA/cantina-escolar/backend/src/modules/auth/auth.controller.ts) (ou `guardians.controller.ts`)
* Adicionar rota pública `POST /api/auth/register-guardian` para o autocadastro do pai.
* A rota receberá: `name`, `email`, `phone`, `password`, `studentEnrollment` e `studentBirthDate`.
* Validará se o estudante existe com aquela matrícula e data de nascimento.
* Se sim, criará o usuário correspondente no banco (função `'guardian'`), criará o registro na tabela `guardians`, associará ao aluno na tabela `student_guardians` e retornará os tokens de login.

#### [MODIFY] [payments.service.ts](file:///c:/Users/enzoverzaro/Documents/ANTI-PROJETOS/SISTEMA%20CANTINA/cantina-escolar/backend/src/modules/payments/payments.service.ts)
* Atualizar a lógica do webhook e da aprovação manual para ler do campo `metadata` se há uma divisão de Pix (*splits*).
* Exemplo: `{ "splits": [{ "studentId": "...", "amount": 25.0 }] }`.
* Em caso positivo, o valor creditado será dividido e injetado individualmente no saldo de cada estudante associado na transação, em vez de ser adicionado integralmente a apenas um aluno.

---

### 2. Painel Admin: CRM de Divulgação e Template do WhatsApp

#### [MODIFY] [SettingsPage.tsx](file:///c:/Users/enzoverzaro/Documents/ANTI-PROJETOS/SISTEMA%20CANTINA/cantina-escolar/web/src/pages/admin/SettingsPage.tsx) e [SettingsPage.css](file:///c:/Users/enzoverzaro/Documents/ANTI-PROJETOS/SISTEMA%20CANTINA/cantina-escolar/web/src/pages/admin/SettingsPage.css)
* Adicionar a aba **"Painel de Divulgação (CRM)"**.
* Essa aba carregará os alunos da escola, exibirá o status de vínculo do responsável (Ativo / Pendente) e um botão de envio direto por WhatsApp com texto pré-configurado.
* Adicionar um campo de edição de template do WhatsApp na aba "Aparência e Cadastro" ou na própria aba CRM, salvando em `localStorage` para fácil personalização pelo gestor da cantina.

---

### 3. Portal de Pais: Autocadastro, Múltiplos Filhos e Recarga Única

#### [MODIFY] [LoginPage.tsx](file:///c:/Users/enzoverzaro/Documents/ANTI-PROJETOS/SISTEMA%20CANTINA/cantina-escolar/web/src/pages/auth/LoginPage.tsx)
* Adicionar link e formulário modal/tela de **"Primeiro Acesso / Cadastrar-se"**.
* O formulário solicitará nome, e-mail, telefone, senha e os dados do filho (matrícula e nascimento) para validação.

#### [MODIFY] [GuardianPortal.tsx](file:///c:/Users/enzoverzaro/Documents/ANTI-PROJETOS/SISTEMA%20CANTINA/cantina-escolar/web/src/pages/guardian/GuardianPortal.tsx)
* Adicionar botão **"Vincular outro filho"** que permite inserir dados (Matrícula + Nascimento) de outro estudante para associá-lo à mesma conta do responsável.
* Atualizar a tela de recargas online: se o responsável possuir múltiplos filhos vinculados, permitir digitar valores parciais de recarga para cada um (ex: R$ 25 para Julia e R$ 25 para Pedro) e gerar um Pix único no valor total (R$ 50), salvando a divisão no `metadata` do pagamento Pix.

---

### 4. PDV (Operator Caixa): Exibição dos Limites Diários

#### [MODIFY] [POSPage.tsx](file:///c:/Users/enzoverzaro/Documents/ANTI-PROJETOS/SISTEMA%20CANTINA/cantina-escolar/web/src/pages/pos/POSPage.tsx)
* Fazer uma requisição ao endpoint `/api/daily-limits/:studentId` assim que um aluno for identificado.
* Exibir no painel do aluno (no cabeçalho do caixa) a informação de limite diário.
* Exemplo: `Saldo: R$ 45,00 | Limite Diário: R$ 20,00 (Disponível hoje: R$ 15,00)`.

---

## 🧪 Plano de Verificação

### Testes Manuais
1. **Autocadastro:** Acessar a tela de login de pais, criar uma conta informando matrícula e nascimento válidos de um aluno e verificar o login automático e vínculo criado.
2. **Adicionar Segundo Filho:** Acessar o Portal de Pais com a conta criada e adicionar um segundo aluno informando seus respectivos matrícula e nascimento.
3. **Recarga Dividida:** Fazer uma recarga combinada de R$ 50,00 (sendo R$ 25,00 para cada um) e verificar se o Pix único é gerado e, após a confirmação do pagamento, se os saldos individuais são atualizados corretamente.
4. **Limite no Caixa:** Acessar o PDV, selecionar o aluno e verificar se o limite diário configurado é exibido abaixo do saldo.
