# Ajustes de usuários, negociações, estoque e permissões

- Novos usuários recebem a senha inicial `@SA20262026`, armazenada como hash scrypt. O formulário mostra a senha padrão e a troca continua obrigatória no próximo acesso.
- Abra um usuário para encontrar **Resetar senha**. Administradores podem resetar usuários; assessores somente usuários vinculados a eles. O reset invalida sessões e links antigos de recuperação.
- Abra uma negociação para **Cancelar negociação** ou **Excluir negociação**. As ações pedem confirmação e usam a versão atual do registro para impedir alterações sobre dados desatualizados.
- Cancelar mantém o histórico e libera as cotas. Negociações canceladas/finalizadas não podem ser canceladas nem reabertas. Excluir remove o histórico, pagamentos e registros de comprovantes permanentemente e libera as cotas. A remoção dos objetos privados de comprovantes ocorre após a confirmação da transação; falhas de Storage são registradas para limpeza posterior.
- Excluir uma negociação já cancelada não libera novamente uma cota que pode ter sido negociada depois. Cotas vinculadas a outra negociação não cancelada permanecem protegidas.
- A aprovação da reserva continua criando a negociação. Finalizar marca as cotas como vendidas; cancelamento de uma negociação ativa devolve o status `available`.
- Substituir estoque é uma transação: preserva cotas reservadas e vínculos com negociações, mantém o ID e não sobrescreve dados de cotas protegidas com os valores da planilha. Erro na importação desfaz a substituição inteira. A proteção também impede liberação de vínculos por edição manual ou sincronização FB.
- Cotações salvas mostram alertas com os códigos reservados/finalizados. **Adicionar cotas** consulta novamente o backend, que retorna erro antes de encaminhar ao estoque. Atualizar uma cotação com cotas indisponíveis também é bloqueado.
- A listagem de negociações mostra somente número, cliente, administradora, categoria e crédito. Condições, situação, pagamentos e demais dados permanecem nos detalhes.
- O backend restringe assessores aos próprios registros e aos de seus usuários vinculados. Os filtros valem também para operações por ID e documentos; indicadores do painel foram restringidos. A troca de conta limpa dados privados em cache no navegador. A visão geral do administrador foi mantida.

Não há alteração de schema nem nova migration nesta implementação. Não houve deploy ou acesso a produção.

Os testes de integração PostgreSQL foram ampliados para substituição de estoque, cancelamento, exclusão, rollback e acesso entre assessores. Para executá-los, configure o banco local de teste conforme `AMBIENTES.md` e ative `RUN_NEGOTIATION_DB_TESTS=1`. Sem esse banco, a suíte de integração permanece desativada; os testes de rotas com banco simulado, hash real e filtros SQL podem rodar normalmente.

Validação desta alteração: TypeScript e build aprovados; 143 testes distintos aprovados entre a suíte e as verificações adicionais. Os 16 testes opt-in com PostgreSQL não foram executados por falta de banco local de teste. Os testes de cancelamento/exclusão foram repetidos após a revisão dos snapshots antigos.

Atualização: após provisionar o banco local TEST, os 16 testes de integração PostgreSQL também foram executados e aprovados. A aplicação está disponível para testes manuais com contas e estoque fictícios; veja `AMBIENTES.md`.
