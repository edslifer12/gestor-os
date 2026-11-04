# Gestor OS

**Sistema desktop para criar, organizar e emitir ordens de serviço com a identidade visual de cada empresa.**

Desenvolvido por **Edson Silva**, o Gestor OS é uma aplicação local voltada a profissionais autônomos e pequenos negócios que precisam cadastrar clientes, preparar atendimentos e gerar ordens de serviço em PDF.

![Versão](https://img.shields.io/badge/vers%C3%A3o-4.4.0-2563eb) ![Plataforma](https://img.shields.io/badge/desktop-Electron-47848f) ![Stack](https://img.shields.io/badge/stack-JavaScript%20%7C%20HTML%20%7C%20CSS-f7df1e)

> **Status:** código-fonte público da versão 4.4.0. Ainda não há instalador em [Releases](https://github.com/edslifer12/gestor-os/releases). Para testar, siga as instruções de execução abaixo.

## Sobre o projeto

O Gestor OS reúne atividades comuns na prestação de serviços: gerenciamento de clientes, preenchimento de ordens de serviço, personalização da empresa emissora e exportação de documentos. Cada usuário pode informar seus dados e sua logo, sem precisar modificar o código-fonte.

### Funcionalidades

- **Ordens de serviço:** preenchimento de dados, serviços, valores e exportação em PDF A4.
- **Clientes:** cadastro, consulta, edição e exclusão, com armazenamento local em SQLite.
- **Preenchimento assistido:** sugestões de clientes e máscara de telefone brasileiro.
- **Empresa configurável:** nome fantasia, razão social, CPF/CNPJ, telefone, e-mail e endereço.
- **Identidade visual:** envio, substituição e remoção de logo PNG/JPEG, aplicada à interface e aos novos PDFs.
- **Preferências:** tema claro/escuro e opção de exibir o campo *solicitante*.
- **Continuidade:** salvamento de rascunho e importação/exportação de backup do rascunho.

## Demonstração

Capturas reais da interface e um GIF/vídeo serão adicionados após validação visual do aplicativo instalado. Até lá, veja a seção **Como executar** para experimentar o sistema. Não são usadas imagens fictícias como se fossem telas do produto.

## Tecnologias e arquitetura

| Camada | Tecnologia / responsabilidade |
| --- | --- |
| Desktop | Electron e Node.js, janelas e diálogos nativos |
| Interface | HTML, CSS e JavaScript |
| Comunicação interna | IPC por API limitada exposta em `preload.js` |
| Persistência | SQLite para clientes e arquivos locais para estado e preferências |
| Documentos | PDF A4 via `webContents.printToPDF` |
| Empacotamento | Electron Forge com Squirrel para Windows |
| Testes | Executor nativo do Node.js (`node --test`) |

### Estrutura de pastas

```text
gestor-os/
├── src/
│   ├── main.js              # Processo principal do Electron
│   ├── preload.js           # Comunicação controlada com a interface
│   ├── renderer/            # Telas, estilos e interações
│   └── services/            # Clientes, armazenamento e validação
├── test/                    # Testes automatizados
├── docs/                    # Validação da versão
├── forge.config.js         # Empacotamento
├── package.json
└── README.md
```

A janela utiliza isolamento de contexto, sandbox e integração direta com Node.js desativada. A API IPC expõe operações específicas em vez de disponibilizar todo o `ipcRenderer`. Essas medidas não substituem uma auditoria de segurança.

## Como executar

**Pré-requisitos:** Node.js **22.13.0 ou superior** e npm.

```bash
git clone https://github.com/edslifer12/gestor-os.git
cd gestor-os
npm ci
npm start
```

Em uma instalação nova, não há empresa, logo ou clientes reais pré-cadastrados.

### Configurar dados da empresa

1. Abra **Configurações → Dados da empresa**.
2. Preencha as informações da empresa emissora.
3. Use **Enviar logo** (PNG/JPEG) ou **Remover logo**, conforme necessário.
4. Clique em **Salvar dados da empresa**.

A imagem aceita até **5 MB** e **4096 × 4096 pixels** e é processada para armazenamento local. Na ausência de logo, o nome da empresa ocupa o espaço correspondente. PDFs emitidos anteriormente não são modificados quando os dados mudam.

## Testes

Execute a suíte automatizada:

```bash
npm test
```

O registro da versão 4.4 em [docs/VALIDACAO.txt](docs/VALIDACAO.txt) informa 31 testes aprovados, mas também explica que a execução visual do Electron e a geração do instalador ainda precisam ser verificadas em ambiente Windows. Esse registro não deve ser confundido com uma validação independente recente.

## Gerar instalador no Windows

```bash
npm ci
npm run make:win
```

O instalador será gerado em `out/make`. **Este repositório distribui código-fonte, não um executável compilado.**

## Persistência, backup e atualização

- Os clientes ficam em **SQLite**.
- Os dados da empresa, logo e preferências ficam em **`state.json`**, com cópia anterior em **`state.backup.json`**.
- O backup JSON exportado pela interface inclui **somente o rascunho da OS**, não os clientes, dados da empresa ou logo.
- Para backup completo, **feche o programa** e copie a pasta de dados inteira, acessível pelo botão próprio no aplicativo.
- A versão 4.4 conserva alguns identificadores técnicos antigos para manter a compatibilidade com os dados da versão 4.3. A autoria do software continua sendo de Edson Silva.

**Privacidade:** nunca publique bancos de dados, arquivos de estado, ordens de serviço reais ou cadastros de clientes. O `.gitignore` ignora padrões de dados locais, mas a revisão humana antes do commit continua importante.

## Próximos passos

Estas melhorias estão planejadas como possibilidades, **não como funcionalidades já entregues**:

- Capturas de tela reais e uma demonstração curta;
- Instalador testado e publicado em GitHub Releases;
- Integração contínua para testes automatizados;
- Documentação mais detalhada da arquitetura.

## Autoria e direitos de uso

**Autor:** Edson Silva — [GitHub @edslifer12](https://github.com/edslifer12).

A empresa configurada no sistema identifica quem emite a ordem de serviço; isso não altera a autoria do código.

**Licenciamento:** este repositório ainda não apresenta uma licença de uso. Código publicamente visível não implica autorização geral para copiar, modificar ou redistribuir. Uma licença poderá ser definida separadamente.

---

*Gestor OS — um projeto de software desktop orientado a necessidades reais de prestação de serviços.*
