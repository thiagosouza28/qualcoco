import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import moment from 'moment';
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { useSync } from '@/components/SyncContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  listAvaliacoesByDate,
  listConfiguracoes,
  listEquipes,
  listRegistrosByAvaliacao,
  queryKeys,
} from '@/lib/dataService';
import { createRelatorioPdfBlob } from '@/lib/relatorioPdf';
import {
  createPageUrl,
  formatResponsaveis,
  getDataBrasil,
  getJornadaData,
  getParcelaBase,
  parseRuasProgramadas,
  parseResponsaveis,
} from '@/utils';

const ROWS_PER_PAGE = 40;
const PREVIEW_ROWS = 12;
const TEAM_SPACER_ROWS = 3;
const FOOTER_CODE = 'SQCOCO - 40-A';
const REFERENTE_LABEL = `Referente${String.fromCharCode(160)}a`;
const REFERENCIA_DIAS = {
  domingo: 'Domingo',
  'segunda-feira': 'Segunda-feira',
  'terca-feira': 'Ter\u00e7a-feira',
  'quarta-feira': 'Quarta-feira',
  'quinta-feira': 'Quinta-feira',
  'sexta-feira': 'Sexta-feira',
  sabado: 'S\u00e1bado',
};

const parseEquipeComFaixa = (nome = '') => {
  const match = nome.match(/^(.*?)(?:\s*\(L(\d+)-(\d+)\))?$/);
  return {
    nome: match?.[1]?.trim() || nome,
    inicio: match?.[2] ? Number(match[2]) : null,
    fim: match?.[3] ? Number(match[3]) : null,
  };
};

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const normalizeText = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const padEquipe = (value) => String(value).padStart(2, '0');
const padRua = (value) => String(value).padStart(2, '0');
const padQuantidade = (value) =>
  value === '' || value == null ? '' : String(value).padStart(2, '0');

const isSiglaResumoParcela = (value) =>
  value === 'A.C.R' ||
  value === 'A.N.C.R' ||
  value === 'A.C.N.R' ||
  value === 'A.N.C.N.R';

const normalizarSiglasResumoParcela = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.entries(raw).reduce((acc, [equipe, sigla]) => {
    if (!isSiglaResumoParcela(sigla)) {
      return acc;
    }

    acc[padEquipe(equipe)] = sigla;
    return acc;
  }, {});
};

const formatRuaRelatorio = (linhaInicial, linhaFinal, separator = ' -> ') =>
  `${padRua(linhaInicial)}${separator}${padRua(linhaFinal)}`;

const getReferenciaDia = (date) => {
  if (!date) return `${REFERENTE_LABEL} -`;
  const diaSemana = normalizeText(moment(date).format('dddd'));
  return `${REFERENTE_LABEL} ${REFERENCIA_DIAS[diaSemana] || moment(date).format('dddd')}`;
};

const getObservacaoReferenciaDia = (date) => {
  if (!date) return `${REFERENTE_LABEL}\n-`;
  const diaSemana = normalizeText(moment(date).format('dddd'));
  return `${REFERENTE_LABEL}\n${REFERENCIA_DIAS[diaSemana] || moment(date).format('dddd')}`;
};

const getReferenteLinhaPorIndice = (referente, rowIndex, totalRows) => {
  const [titulo = REFERENTE_LABEL, diaReferencia = '-'] = String(referente || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  if (totalRows <= 1) {
    return `${titulo}\n${diaReferencia}`;
  }

  if (rowIndex === 0) {
    return titulo;
  }

  if (rowIndex === 1) {
    return diaReferencia;
  }

  return '';
};

const montarObservacaoRelatorio = (_date, observacao) =>
  String(observacao || '').trim();

const getEquipeOrder = (numero) => {
  const parsed = Number(numero);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const createEquipeMeta = (equipeId, equipeInfo, equipeRecord) => {
  if (!equipeId && !equipeInfo?.nome && equipeRecord?.numero == null) {
    return null;
  }

  const numero =
    equipeRecord?.numero != null
      ? padEquipe(equipeRecord.numero)
      : equipeInfo?.nome || '-';

  return {
    key: equipeId || equipeInfo?.nome || numero,
    numero,
    ordem: getEquipeOrder(equipeRecord?.numero),
  };
};

const getEquipeMetaDoRegistro = (avaliacao, registro, equipesById) => {
  const equipe1Info = parseEquipeComFaixa(avaliacao?.equipe1_nome);
  const equipe2Info = parseEquipeComFaixa(avaliacao?.equipe2_nome);
  const equipe1Meta = createEquipeMeta(
    avaliacao?.equipe1_id,
    equipe1Info,
    equipesById[avaliacao?.equipe1_id],
  );
  const equipe2Meta = createEquipeMeta(
    avaliacao?.equipe2_id,
    equipe2Info,
    equipesById[avaliacao?.equipe2_id],
  );
  const linha = Number(registro?.linha_inicial);

  if (equipe2Meta && equipe2Info.inicio && equipe2Info.fim) {
    if (linha >= equipe2Info.inicio && linha <= equipe2Info.fim) {
      return equipe2Meta;
    }
  }

  if (equipe1Meta && equipe1Info.inicio && equipe1Info.fim) {
    if (linha >= equipe1Info.inicio && linha <= equipe1Info.fim) {
      return equipe1Meta;
    }
  }

  if (equipe1Meta && !equipe2Meta) return equipe1Meta;
  if (equipe2Meta && !equipe1Meta) return equipe2Meta;

  if (
    equipe1Meta &&
    equipe2Meta &&
    !equipe1Info.inicio &&
    !equipe2Info.inicio
  ) {
    return {
      key: `${equipe1Meta.key}/${equipe2Meta.key}`,
      numero: `${equipe1Meta.numero}/${equipe2Meta.numero}`,
      ordem: Math.min(equipe1Meta.ordem, equipe2Meta.ordem),
    };
  }

  return (
    equipe1Meta || {
      key: 'sem-equipe',
      numero: '-',
      ordem: Number.MAX_SAFE_INTEGER,
    }
  );
};

const getObservacaoRegistro = (registro) => {
  const observacoes = Array.isArray(registro?.observacoes)
    ? registro.observacoes
    : [];
  const livre = registro?.observacao_livre?.trim();
  return [...observacoes, livre].filter(Boolean).join(' - ');
};

const getRegistroPairKey = (registro) =>
  `${registro?.linha_inicial}-${registro?.linha_final}`;

const renderHighlightedValue = (value, highlighted) => {
  const safeValue = escapeHtml(value);
  if (!safeValue) return '';
  return highlighted
    ? `<span style="display:inline-block;border-radius:4px;background:#bbf7d0;color:#14532d;font-weight:700;padding:0 4px;">${safeValue}</span>`
    : safeValue;
};

const renderResponsaveisHtml = (responsaveis = []) => {
  const items = responsaveis.length > 0 ? responsaveis : ['-'];
  return `
    <div class="responsaveis-grid ${items.length > 1 ? 'multiple' : 'single'}">
      ${items
        .map(
          (item) =>
            `<span class="responsavel-item">${escapeHtml(item)}</span>`,
        )
        .join('')}
    </div>
  `;
};

const PREVIEW_ROW_CLASS = 'border-b border-slate-100 text-sm h-[44px]';

const paginateGroupedRows = (groups, rowsPerPage) => {
  if (!groups.length) {
    return [{ entries: [], blankRows: rowsPerPage }];
  }

  const pages = [];
  let currentEntries = [];
  let remainingRows = rowsPerPage;

  const pushPage = () => {
    pages.push({
      entries: currentEntries,
      blankRows: remainingRows,
    });
    currentEntries = [];
    remainingRows = rowsPerPage;
  };

  groups.forEach((group) => {
    const groupFitsSinglePage = group.rows.length <= rowsPerPage;
    let start = 0;

    while (start < group.rows.length) {
      const isFirstSegment = start === 0;

      if (isFirstSegment && groupFitsSinglePage) {
        const requiredRows =
          group.rows.length +
          (currentEntries.length > 0 ? TEAM_SPACER_ROWS : 0);
        if (currentEntries.length > 0 && requiredRows > remainingRows) {
          pushPage();
        }
      }

      if (isFirstSegment && currentEntries.length > 0) {
        if (remainingRows <= TEAM_SPACER_ROWS) {
          pushPage();
        }

        if (currentEntries.length > 0) {
          currentEntries.push({
            type: 'spacer',
            key: `spacer-${group.key}-${pages.length}-${start}`,
            count: TEAM_SPACER_ROWS,
          });
          remainingRows -= TEAM_SPACER_ROWS;
        }
      }

      if (remainingRows === 0) {
        pushPage();
      }

      const take = Math.min(group.rows.length - start, remainingRows);
      currentEntries.push({
        type: 'segment',
        key: `${group.key}-${start}`,
        equipe: group.equipe,
        responsaveis: group.responsaveis,
        referentes: group.referentes,
        rows: group.rows.slice(start, start + take),
      });
      start += take;
      remainingRows -= take;
    }
  });

  pushPage();
  return pages;
};

const buildTableRowsHtml = (page) => {
  const rowsHtml = page.entries
    .map((entry) => {
      if (entry.type === 'spacer') {
        return Array.from(
          { length: entry.count },
          () => `
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          `,
        ).join('');
      }

      return entry.rows
        .map(
          (row, index) => `
            <tr>
              <td>${row.data ? escapeHtml(moment(row.data).format('DD/MM/YYYY')) : ''}</td>
              <td>${escapeHtml(row.parcela)}</td>
              <td>${escapeHtml(row.equipe)}</td>
              <td>${escapeHtml(row.rua)}</td>
              <td>${renderHighlightedValue(row.cachoPl, row.excedeuCacho)}</td>
              <td>${renderHighlightedValue(row.cocosDeixados, row.excedeuCocos)}</td>
              <td>${escapeHtml(row.observacao || '-').replaceAll('\n', '<br />')}</td>
              <td>${escapeHtml(
                getReferenteLinhaPorIndice(row.referente, index, entry.rows.length),
              ).replaceAll('\n', '<br />')}</td>
            </tr>
          `,
        )
        .join('');
    })
    .join('');

  const blankRowsHtml = Array.from({ length: page.blankRows }, () => `
      <tr>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `).join('');

  return `${rowsHtml}${blankRowsHtml}`;
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const openPdfInBrowser = (blob, fileName) => {
  const blobUrl = URL.createObjectURL(blob);
  const popup = window.open(blobUrl, '_blank');

  if (!popup) {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
};

const RELATORIO_NATIVE_DIRECTORY = Directory.Cache;

const saveAndOpenPdfOnDevice = async (blob, fileName) => {
  const path = `Relatorios/${fileName}`;
  const data = await blobToBase64(blob);

  await Filesystem.writeFile({
    path,
    data,
    // Usa armazenamento interno do app para evitar EACCES em Documents.
    directory: RELATORIO_NATIVE_DIRECTORY,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({
    path,
    directory: RELATORIO_NATIVE_DIRECTORY,
  });

  try {
    await FileOpener.open({
      filePath: uri,
      contentType: 'application/pdf',
      openWithDefault: false,
    });
    return;
  } catch (error) {
    const { value } = await Share.canShare();
    if (!value) {
      throw error;
    }

    await Share.share({
      title: 'Relat\u00f3rio QualCoco',
      text: 'PDF di\u00e1rio de controle de qualidade',
      files: [uri],
      dialogTitle: 'Abrir ou compartilhar PDF',
    });
  }
};

function Relatorio() {
  const navigate = useNavigate();
  const { isOnline } = useSync();
  const [selectedDate, setSelectedDate] = useState(
    getJornadaData() || getDataBrasil(),
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const { data: avaliacoes = [] } = useQuery({
    queryKey: queryKeys.avaliacoesData(selectedDate),
    queryFn: () => listAvaliacoesByDate(selectedDate, isOnline),
    enabled: Boolean(selectedDate),
  });
  const { data: equipes = [] } = useQuery({
    queryKey: queryKeys.equipes,
    queryFn: () => listEquipes(isOnline),
  });
  const { data: configs = [] } = useQuery({
    queryKey: queryKeys.configuracao,
    queryFn: () => listConfiguracoes(isOnline),
  });

  const avaliacaoIds = useMemo(
    () => avaliacoes.map((item) => item.id),
    [avaliacoes],
  );

  const { data: registrosPorAvaliacao = {} } = useQuery({
    queryKey: ['relatorio', 'registros', selectedDate, ...avaliacaoIds],
    queryFn: async () => {
      if (avaliacoes.length === 0) return {};
      const entries = await Promise.all(
        avaliacoes.map(async (avaliacao) => [
          avaliacao.id,
          await listRegistrosByAvaliacao(avaliacao.id, isOnline),
        ]),
      );
      return Object.fromEntries(entries);
    },
    enabled: Boolean(selectedDate),
  });

  const equipesById = useMemo(
    () =>
      equipes.reduce((acc, equipe) => {
        acc[equipe.id] = equipe;
        return acc;
      }, {}),
    [equipes],
  );

  const limiteCocos = configs[0]?.limite_cocos ?? 2;
  const limiteCachos = configs[0]?.limite_cachos ?? 2;

  const rows = useMemo(() => {
    const dataset = avaliacoes.flatMap((avaliacao) => {
      const registros = [...(registrosPorAvaliacao[avaliacao.id] || [])].sort(
        (a, b) => a.linha_inicial - b.linha_inicial,
      );
      const ruasProgramadas = parseRuasProgramadas(avaliacao.ruas_programadas);
      const registrosByPair = new Map(
        registros.map((registro) => [getRegistroPairKey(registro), registro]),
      );
      const parcelaCompleta =
        ruasProgramadas.length > 0 &&
        ruasProgramadas.every(([linhaInicial, linhaFinal]) =>
          registrosByPair.has(`${linhaInicial}-${linhaFinal}`),
        );

      const plannedRows = ruasProgramadas.map(([linhaInicial, linhaFinal], index) => {
        const registro =
          registrosByPair.get(`${linhaInicial}-${linhaFinal}`) || null;
        const equipeMeta = getEquipeMetaDoRegistro(
          avaliacao,
          registro || {
            linha_inicial: linhaInicial,
            linha_final: linhaFinal,
          },
          equipesById,
        );

        return {
          id: registro?.id || `${avaliacao.id}-${linhaInicial}-${linhaFinal}-${index}`,
          data: registro?.data || avaliacao.data || selectedDate || '',
          parcela: getParcelaBase(avaliacao.parcela || ''),
          parcelaCompleta,
          equipe: equipeMeta.numero,
          equipeKey: equipeMeta.key,
          equipeOrdem: equipeMeta.ordem,
          linhaInicial: Number(linhaInicial || 0),
          rua: formatRuaRelatorio(linhaInicial, linhaFinal, '-'),
          cachoPl: registro ? padQuantidade(registro.cachos_3_cocos ?? '') : '',
          cocosDeixados: registro
            ? padQuantidade(registro.cocos_chao ?? '')
            : '',
          responsavelRaw: String(avaliacao.responsavel || '').trim(),
          responsaveisLista: parseResponsaveis(avaliacao.responsavel || ''),
          referente: getObservacaoReferenciaDia(
            avaliacao.data_colheita ||
              avaliacao.dataColheita ||
              registro?.data ||
              avaliacao.data ||
              selectedDate ||
              '',
          ),
          observacao: montarObservacaoRelatorio(
            avaliacao.data_colheita ||
              avaliacao.dataColheita ||
              registro?.data ||
              avaliacao.data ||
              selectedDate ||
              '',
            getObservacaoRegistro(registro),
          ),
          excedeuCacho: Number(registro?.cachos_3_cocos || 0) > limiteCachos,
          excedeuCocos: Number(registro?.cocos_chao || 0) > limiteCocos,
        };
      });

      const extraRows = registros
        .filter(
          (registro) =>
            !ruasProgramadas.some(
              ([linhaInicial, linhaFinal]) =>
                linhaInicial === registro.linha_inicial &&
                linhaFinal === registro.linha_final,
            ),
        )
        .map((registro, index) => {
          const equipeMeta = getEquipeMetaDoRegistro(
            avaliacao,
            registro,
            equipesById,
          );

          return {
            id:
              registro.id ||
              `${avaliacao.id}-${registro.linha_inicial}-${registro.linha_final}-extra-${index}`,
            data: registro.data || avaliacao.data || selectedDate || '',
            parcela: getParcelaBase(avaliacao.parcela || ''),
            parcelaCompleta,
            equipe: equipeMeta.numero,
            equipeKey: equipeMeta.key,
            equipeOrdem: equipeMeta.ordem,
            linhaInicial: Number(registro.linha_inicial || 0),
            rua: formatRuaRelatorio(registro.linha_inicial, registro.linha_final, '-'),
            cachoPl: padQuantidade(registro.cachos_3_cocos ?? ''),
            cocosDeixados: padQuantidade(registro.cocos_chao ?? ''),
            responsavelRaw: String(avaliacao.responsavel || '').trim(),
            responsaveisLista: parseResponsaveis(avaliacao.responsavel || ''),
            referente: getObservacaoReferenciaDia(
              avaliacao.data_colheita ||
                avaliacao.dataColheita ||
                registro?.data ||
                avaliacao.data ||
                selectedDate ||
                '',
            ),
            observacao: montarObservacaoRelatorio(
              avaliacao.data_colheita ||
                avaliacao.dataColheita ||
                registro?.data ||
                avaliacao.data ||
                selectedDate ||
                '',
              getObservacaoRegistro(registro),
            ),
            excedeuCacho: Number(registro.cachos_3_cocos || 0) > limiteCachos,
            excedeuCocos: Number(registro.cocos_chao || 0) > limiteCocos,
          };
        });

      return [...plannedRows, ...extraRows];
    });

    return dataset.sort((a, b) => {
      if (a.equipeOrdem !== b.equipeOrdem) {
        return a.equipeOrdem - b.equipeOrdem;
      }
      if (a.equipe !== b.equipe) {
        return String(a.equipe).localeCompare(String(b.equipe));
      }
      if (a.parcela !== b.parcela) {
        return String(a.parcela).localeCompare(String(b.parcela));
      }
      return a.linhaInicial - b.linhaInicial;
    });
  }, [
    avaliacoes,
    equipesById,
    limiteCachos,
    limiteCocos,
    registrosPorAvaliacao,
    selectedDate,
  ]);

  const teamGroups = useMemo(() => {
    const groups = new Map();

    rows.forEach((row) => {
      if (!groups.has(row.equipeKey)) {
        groups.set(row.equipeKey, {
          key: row.equipeKey,
          equipe: row.equipe,
          equipeOrdem: row.equipeOrdem,
          responsaveis: new Set(),
          referentes: new Set(),
          rows: [],
        });
      }

      const currentGroup = groups.get(row.equipeKey);
      (row.responsaveisLista.length > 0
        ? row.responsaveisLista
        : parseResponsaveis(row.responsavelRaw)
      ).forEach((responsavel) => currentGroup.responsaveis.add(responsavel));
      if (row.referente) {
        currentGroup.referentes.add(row.referente);
      }
      currentGroup.rows.push(row);
    });

    return Array.from(groups.values())
      .sort((a, b) => {
        if (a.equipeOrdem !== b.equipeOrdem) {
          return a.equipeOrdem - b.equipeOrdem;
        }
        return String(a.equipe).localeCompare(String(b.equipe));
      })
      .map((group) => ({
        ...group,
        responsaveis: parseResponsaveis(
          formatResponsaveis(Array.from(group.responsaveis)),
        ),
        referentes: Array.from(group.referentes),
      }));
  }, [rows]);

  const printPages = useMemo(
    () => paginateGroupedRows(teamGroups, ROWS_PER_PAGE),
    [teamGroups],
  );

  const previewPage = useMemo(
    () => paginateGroupedRows(teamGroups, PREVIEW_ROWS)[0],
    [teamGroups],
  );

  const referenteLabel = useMemo(
    () => getReferenciaDia(selectedDate),
    [selectedDate],
  );

  const totalResponsaveis = useMemo(
    () =>
      new Set(teamGroups.flatMap((group) => group.responsaveis)).size,
    [teamGroups],
  );

  const totalParcelas = useMemo(
    () =>
      new Set(
        avaliacoes.map((avaliacao) => getParcelaBase(avaliacao.parcela)),
      ).size,
    [avaliacoes],
  );

  const handlePrint = async () => {
    const dataTitulo = selectedDate
      ? moment(selectedDate).format('DD/MM/YYYY')
      : '-';
    const fileName = `qualcoco-relatorio-${selectedDate || getDataBrasil()}.pdf`;

    setIsGeneratingPdf(true);

    try {
      const pdfBlob = createRelatorioPdfBlob({
        dataTitulo,
        referenteLabel,
        footerCode: FOOTER_CODE,
        printPages,
      });

      if (Capacitor.isNativePlatform()) {
        await saveAndOpenPdfOnDevice(pdfBlob, fileName);
        return;
      }

      openPdfInBrowser(pdfBlob, fileName);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <main className="page-shell">
      <PageHeader
        title={'Relat\u00f3rio'}
        subtitle={'Folha di\u00e1ria consolidada por data'}
        onBack={() => navigate(createPageUrl('Dashboard'))}
      />

      <section className="page-content space-y-4 pt-5">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {'Data do relat\u00f3rio'}
              </p>
              <Input
                type="date"
                className="mt-2"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Referente
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {referenteLabel}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Equipes do dia
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {teamGroups.length}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Parcelas
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {totalParcelas}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {'Respons\u00e1veis'}
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {totalResponsaveis}
                </p>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={handlePrint}
              disabled={isGeneratingPdf}
            >
              <FileText className="h-5 w-5" />
              {isGeneratingPdf ? 'Gerando PDF...' : 'Gerar PDF'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                Nenhum registro encontrado para a data selecionada. O PDF ainda
                {'sai no modelo em branco, com a data e o dia de refer\u00eancia.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] table-fixed border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <th className="w-20 px-3 py-3 text-center">Data</th>
                      <th className="w-24 px-3 py-3 text-center">Parcela</th>
                      <th className="w-20 px-3 py-3 text-center">Equipe</th>
                      <th className="w-24 px-3 py-3 text-center">Rua</th>
                      <th className="w-24 px-3 py-3 text-center">Cacho/Pl</th>
                      <th className="w-24 px-3 py-3 text-center">Cocos</th>
                      <th className="w-44 px-3 py-3 text-center">
                        Resp. Levant.
                      </th>
                      <th className="px-3 py-3 text-center">{'Observa\u00e7\u00e3o'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPage.entries.map((entry) => {
                      if (entry.type === 'spacer') {
                        return Array.from({ length: entry.count }, (_, index) => (
                          <tr
                            key={`${entry.key}-${index}`}
                            className={PREVIEW_ROW_CLASS}
                          >
                            <td className="px-3 py-3">&nbsp;</td>
                            <td className="px-3 py-3">&nbsp;</td>
                            <td className="px-3 py-3">&nbsp;</td>
                            <td className="px-3 py-3">&nbsp;</td>
                            <td className="px-3 py-3">&nbsp;</td>
                            <td className="px-3 py-3">&nbsp;</td>
                            <td className="px-3 py-3">&nbsp;</td>
                            <td className="px-3 py-3">&nbsp;</td>
                          </tr>
                        ));
                      }

                      return (
                        <Fragment key={entry.key}>
                          {entry.rows.map((row, index) => (
                            <tr
                              key={row.id}
                              className={PREVIEW_ROW_CLASS}
                            >
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {row.data ? moment(row.data).format('DD/MM') : '-'}
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {row.parcela || '-'}
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {row.equipe || '-'}
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {row.rua || '-'}
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span
                                  className={
                                    row.excedeuCacho
                                      ? 'inline-block rounded bg-green-200 px-1 font-bold text-green-900'
                                      : ''
                                  }
                                >
                                  {row.cachoPl || '-'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span
                                  className={
                                    row.excedeuCocos
                                      ? 'inline-block rounded bg-green-200 px-1 font-bold text-green-900'
                                      : ''
                                  }
                                >
                                  {row.cocosDeixados || '-'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center whitespace-pre-line break-words">
                                {row.observacao || '-'}
                              </td>
                              <td className="px-3 py-3 text-center whitespace-pre-line break-words">
                                {getReferenteLinhaPorIndice(
                                  row.referente,
                                  index,
                                  entry.rows.length,
                                )}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {rows.length > PREVIEW_ROWS ? (
          <p className="px-1 text-xs text-slate-500">
            {'Pr\u00e9via da primeira p\u00e1gina do relat\u00f3rio. O PDF inclui todas as '}
            equipes e todas as linhas da data selecionada.
          </p>
        ) : null}

        <Card>
          <CardContent className="space-y-2 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">
              <FileText className="mr-2 inline h-4 w-4" />
              Modelo do PDF
            </p>
            <p>
              O PDF sai consolidado por data, com todas as equipes do dia no
              {' mesmo relat\u00f3rio e com o cabe\u00e7alho no formato `{referenteLabel}`.'}
            </p>
            <p>
              {'A coluna `Resp. Levant.` mostra as observa\u00e7\u00f5es de cada rua, e a '}
              {'coluna `Observa\u00e7\u00e3o` mostra o `Referente a` apenas na primeira '}
              linha de cada equipe.
            </p>
            <p>
              {'No Android, o arquivo \u00e9 salvo e aberto no seletor de apps, para '}
              {'voc\u00ea conseguir visualizar pelo Google Drive ou outro leitor de '}
              PDF instalado.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default Relatorio;
