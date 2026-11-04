# Gestor OS

Sistema desktop local para ordens de serviço, desenvolvido por **Edson Silva** em Electron, JavaScript, HTML e CSS.

## Versão 4.4

- Empresa configurável: nome fantasia, razão social, CPF/CNPJ, telefone, e-mail e endereço.
- Seleção, substituição e remoção de logo PNG/JPEG. A imagem mantém suas proporções.
- Identidade aplicada à interface e aos próximos PDFs. PDFs já emitidos permanecem inalterados.
- Mantidos o layout, cores, tema claro/escuro, opção de solicitante, clientes SQLite, sugestões de nomes e máscara de telefone.
- Instalação nova começa sem empresa, logo ou dados reais cadastrados.

## Executar

Requer Node.js 22.13 ou superior e npm.

```sh
npm ci
npm start
```

## Configurar a empresa

Abra **Configurações → Dados da empresa**, preencha os campos e use **Enviar logo** se desejar. Clique em **Salvar dados da empresa** para aplicar. Para retirar a imagem, use **Remover logo** e salve. Sem logo, o nome da empresa ocupa o mesmo espaço na interface e no PDF.

A imagem de entrada aceita até 5 MB e 4096 × 4096 pixels. É convertida para PNG e pode ser reduzida para armazenamento local. A prévia nas configurações mostra a imagem selecionada; a interface e o PDF usam a última configuração salva.

## Testes

```sh
npm test
```

## Gerar instalador no Windows

```sh
npm ci
npm run make:win
```

O instalador será gerado dentro de `out/make`. Este pacote contém código-fonte; não inclui instalador compilado.

## Atualizar e preservar os dados

Feche o programa antes de atualizar os arquivos do projeto. Na versão atual, a pasta local de dados e os identificadores internos foram mantidos compatíveis com a versão 4.3. Isso preserva clientes, rascunho, contador e preferências existentes no mesmo computador. O nome antigo ainda aparece em alguns identificadores técnicos por essa compatibilidade; a autoria é de Edson Silva.

Antes de atualizar, copie a pasta completa de dados usando o botão de abrir a pasta no aplicativo. O backup JSON exportado pelo programa contém apenas o rascunho da OS; não inclui clientes, dados da empresa ou logo. Para backup completo, feche o aplicativo e copie toda a pasta de dados.

Os dados da empresa e a logo ficam em `state.json`, com cópia anterior em `state.backup.json`; os clientes ficam em SQLite. Esses arquivos são gerados fora do código-fonte. Não publique arquivos reais de atendimento, cadastros ou cópias de dados no GitHub.

## Autoria

Desenvolvido por **Edson Silva**. A empresa cadastrada identifica quem emite a ordem de serviço e não altera a autoria do software.
