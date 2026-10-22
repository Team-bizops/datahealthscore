// Configuração do Data Health Score (RankMyApp · BizOps)
// Propriedades com mais de um candidato: a rotina usa a primeira que existir no HubSpot.
export const PORTAL = '44530090';

export const PESOS = { acuracia: 0.25, consistencia: 0.25, completude: 0.20, unicidade: 0.15, integridade: 0.15 };

export const LEAD_PIPELINES = ['739923376', '916004981']; // SDRs, Executivos
export const LEAD_AGENDADO = ['1076481948', '1395409172']; // Reunião Agendada (SDRs), Agendado (Executivos)
export const LEAD_FECHADO = ['1076481948', '1077569105', '1077569106', '1395409172', '1395409173', '1395409174'];

export const DEAL_PIPE_RMAPP = '94613875';

export const CLIENTE_ATIVO = ['1276548356', '1334456338']; // etapa "Ativo" (MI e RI)
export const CONTRATO_VIGENTE = ['1225066839', '1225024811', '1225024812', '1225024813', '1225024814', '1225024815',
  '1334401687', '1334401688', '1334401689', '1334401690', '1334401691', '1334401692']; // etapas abertas, inclui "Contrato estendido"

export const OBJ = {
  clientes: 'p44530090_clientes_rmapp',
  contratos: 'p44530090_contratos_rmapp',
  // Objeto que representa os "grupos" de RMAds. Pode ser trocado pela variável de ambiente GRUPOS_OBJECT.
  grupos: 'p44530090_campanhas_rmads'
};

export const PROPS = {
  companies: {
    nome: ['name'], dominio: ['domain'], porte: ['colaboradores'], funcionarios: ['numberofemployees'],
    abrangencia: ['abrangencia_de_atuacao'], pais: ['pais', 'country'], segmento: ['segmento'], cnpj: ['cnpj'],
    lifecycle: ['lifecyclestage'], origem: ['hs_object_source'], n_contatos: ['num_associated_contacts'], n_negocios: ['num_associated_deals']
  },
  contacts: {
    nome: ['firstname'], sobrenome: ['lastname'], email: ['email'], empresa: ['company'], cargo: ['cargo', 'jobtitle'],
    area_poc: ['area_do_poc'], origem: ['hs_object_source'], n_negocios: ['num_associated_deals'],
    mql: ['hs_lifecyclestage_marketingqualifiedlead_date']
  },
  deals: { nome: ['dealname'], pipeline: ['pipeline'], etapa: ['dealstage'], ganho: ['hs_is_closed_won'], cnpj: ['cnpj'], fechamento: ['closedate'] },
  leads: { nome: ['hs_lead_name'], pipeline: ['hs_pipeline'], etapa: ['hs_pipeline_stage'] },
  clientes: { nome: ['nome_do_cliente', 'hs_name'], etapa: ['hs_pipeline_stage'], mrr: ['valor_do_mrr', 'valor_mrr'], cnpj: ['cnpj', 'cnpj_do_cliente'],
    porte: ['porte_da_empresa', 'porte', 'colaboradores'], segmento: ['segmento_da_empresa', 'segmento'], criado: ['hs_createdate'] },
  contratos: { nome: ['nome_do_contrato', 'hs_name', 'nome'], etapa: ['hs_pipeline_stage'], mrr: ['valor_mrr', 'valor_mrr_1', 'valor_em_mrr'],
    inicio: ['data_de_inicio_do_contrato', 'data_inicio_do_contrato', 'inicio_do_contrato'], fim: ['data_de_fim_do_contrato', 'data_fim_do_contrato', 'fim_do_contrato'],
    store: ['store'], apps: ['nome_dos_apps', 'nome_do_app', 'apps'], numero: ['numero_do_contrato', 'n_do_contrato_1', 'no_do_contrato'] },
  grupos: { nome: ['nome_da_campanha', 'hs_name', 'nome'], status: ['status', 'status_do_grupo', 'hs_pipeline_stage'] }
};
