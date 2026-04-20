import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment';

const PAGE_MARGIN_X = 8;
const PAGE_TITLE_Y = 12;
const PAGE_SUBTITLE_Y = 17;
const PAGE_TABLE_START_Y = 21;
const PAGE_FOOTER_Y = 286;
const FOOTER_FONT_SIZE = 8;
const BODY_FONT_SIZE = 8.5;
const HEADER_FONT_SIZE = 8.5;
const TITLE_FONT_SIZE = 12;
const SUBTITLE_FONT_SIZE = 8.5;
const ROW_HEIGHT_MM = 6.1;
const MARKER_FILL = [187, 247, 208];
const MARKER_TEXT = [20, 83, 45];
const BORDER_COLOR = [17, 17, 17];
const TEXT_COLOR = [17, 17, 17];
const OBSERVACAO_TOP_ROWS = 2;
const OBSERVACAO_VERTICAL_MIN_FONT_SIZE = 6.5;
const OBSERVACAO_VERTICAL_MAX_FONT_SIZE = 11;
const OBSERVACAO_VERTICAL_PADDING = 2.5;

const TABLE_COLUMNS = [
  { header: 'Data', dataKey: 'data' },
  { header: 'Parcela', dataKey: 'parcela' },
  { header: 'Equipe', dataKey: 'equipe' },
  { header: 'Rua', dataKey: 'rua' },
  { header: 'Cacho/Pl', dataKey: 'cachoPl' },
  { header: 'Cocos Deixados', dataKey: 'cocosDeixados' },
  { header: 'Resp. Levant.', dataKey: 'responsavel' },
  { header: 'Observa\u00e7\u00e3o', dataKey: 'observacao' },
];

const TABLE_COLUMN_STYLES = {
  data: { cellWidth: 18, halign: 'center' },
  parcela: { cellWidth: 20, halign: 'center' },
  equipe: { cellWidth: 14, halign: 'center' },
  rua: { cellWidth: 20, halign: 'center' },
  cachoPl: { cellWidth: 18, halign: 'center' },
  cocosDeixados: { cellWidth: 26, halign: 'center' },
  responsavel: { cellWidth: 56, halign: 'center', overflow: 'linebreak' },
  observacao: { cellWidth: 22, halign: 'center', overflow: 'linebreak' },
};

const createBlankPdfRow = () => ({
  data: '',
  parcela: '',
  equipe: '',
  rua: '',
  cachoPl: '',
  cocosDeixados: '',
  responsavel: '',
  observacao: '',
  observacaoSegmentKey: null,
  observacaoSegmentRowIndex: -1,
  observacaoSegmentRowCount: 0,
  observacaoVerticalText: '',
  highlightCacho: false,
  highlightCocos: false,
});

const formatResponsaveisPdf = (responsaveis = []) => {
  const items = responsaveis.filter(Boolean);
  if (items.length === 0) return '-';
  return items.join(' - ');
};

const formatObservacaoColunaPdf = (value = '') => {
  const normalized = String(value || '').trim();
  return normalized || '-';
};

const formatSiglaResumoParcelaPdf = (value = '') =>
  String(value || '').trim() === 'A.N.C.R' ? 'A.R.N.C' : String(value || '').trim();

const getReferenteEquipeLinhasPdf = (value = '') => {
  const itens = String(value || '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  const diaReferencia =
    itens.find((item) => item.toLowerCase() !== 'referente a') || '-';

  return ['Referente a', diaReferencia];
};

const buildObservacaoLayoutPdf = ({
  referente,
  responsaveis = [],
  rowIndex,
  totalRows,
}) => {
  const [titulo, diaReferencia] = getReferenteEquipeLinhasPdf(referente);
  const nomesResponsaveis = formatResponsaveisPdf(responsaveis);

  if (totalRows <= 1) {
    return {
      text: `${titulo}\n${diaReferencia}\n\n${nomesResponsaveis}`,
      verticalText: '',
    };
  }

  if (rowIndex === 0) {
    return {
      text: titulo,
      verticalText: '',
    };
  }

  if (rowIndex === 1) {
    return {
      text: totalRows === 2 ? `${diaReferencia}\n\n${nomesResponsaveis}` : diaReferencia,
      verticalText: '',
    };
  }

  if (rowIndex === OBSERVACAO_TOP_ROWS) {
    return {
      text: '',
      verticalText: nomesResponsaveis,
    };
  }

  return {
    text: '',
    verticalText: '',
  };
};

const drawVerticalObservacaoPdf = (doc, {
  cells,
  text,
}) => {
  const printableText = String(text || '').trim() || '-';
  if (!cells || cells.length === 0) {
    return;
  }

  const firstCell = cells[0];
  const area = {
    x: firstCell.x,
    y: firstCell.y,
    width: firstCell.width,
    height: cells.reduce((total, cell) => total + cell.height, 0),
  };

  const maxTextWidth = Math.max(area.height - OBSERVACAO_VERTICAL_PADDING * 2, 10);
  let fontSize = OBSERVACAO_VERTICAL_MAX_FONT_SIZE;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_COLOR);

  while (fontSize > OBSERVACAO_VERTICAL_MIN_FONT_SIZE) {
    doc.setFontSize(fontSize);
    if (doc.getTextWidth(printableText) <= maxTextWidth) {
      break;
    }
    fontSize -= 0.5;
  }

  doc.text(
    printableText,
    area.x + area.width / 2,
    area.y + area.height / 2,
    {
      align: 'center',
      baseline: 'middle',
      angle: 90,
    },
  );
};

const buildSubtitleText = (dataTitulo, referenteLabel) => {
  const title = String(dataTitulo || '').trim();
  const subtitle = String(referenteLabel || '').trim();

  if (title && subtitle) {
    return `${title} | ${subtitle}`;
  }

  return title || subtitle || '-';
};

const createPdfRows = (page) => {
  const rows = [];
  const body = [];

  page.entries.forEach((entry) => {
    if (entry.type === 'spacer') {
      for (let index = 0; index < entry.count; index += 1) {
        const blankRow = createBlankPdfRow();
        rows.push(blankRow);
        body.push([
          blankRow.data,
          blankRow.parcela,
          blankRow.equipe,
          blankRow.rua,
          blankRow.cachoPl,
          blankRow.cocosDeixados,
          blankRow.responsavel,
          blankRow.observacao,
        ]);
      }
      return;
    }

    entry.rows.forEach((row, index) => {
      const isPrimeiraLinhaEquipe = index === 0;
      const parcelaAnterior = index > 0 ? entry.rows[index - 1]?.parcela : null;
      const isPrimeiraLinhaParcela =
        isPrimeiraLinhaEquipe || parcelaAnterior !== row.parcela;
      const proximaParcela =
        index < entry.rows.length - 1 ? entry.rows[index + 1]?.parcela : null;
      const isUltimaLinhaParcela =
        index === entry.rows.length - 1 || proximaParcela !== row.parcela;
      const responsavelLinhas = [];

      if (row.observacao) {
        responsavelLinhas.push(formatObservacaoColunaPdf(row.observacao));
      }
      if (
        isUltimaLinhaParcela &&
        row.parcelaCompleta !== false &&
        row.siglaResumoParcela
      ) {
        responsavelLinhas.push(formatSiglaResumoParcelaPdf(row.siglaResumoParcela));
      }

      const observacaoLayout = buildObservacaoLayoutPdf({
        referente: row.referente,
        responsaveis: entry.responsaveis || [],
        rowIndex: index,
        totalRows: entry.rows.length,
      });

      const pdfRow = {
        data:
          isPrimeiraLinhaEquipe && row.data
            ? moment(row.data).format('DD/MM/YYYY')
            : '',
        parcela: isPrimeiraLinhaParcela ? row.parcela || '' : '',
        equipe: isPrimeiraLinhaEquipe ? row.equipe || '' : '',
        rua: row.rua || '',
        cachoPl: row.cachoPl || '',
        cocosDeixados: row.cocosDeixados || '',
        responsavel: responsavelLinhas.length > 0
          ? responsavelLinhas.join('\n')
          : '',
        observacao: observacaoLayout.text,
        observacaoSegmentKey: entry.key,
        observacaoSegmentRowIndex: index,
        observacaoSegmentRowCount: entry.rows.length,
        observacaoVerticalText: observacaoLayout.verticalText,
        highlightCacho: row.excedeuCacho,
        highlightCocos: row.excedeuCocos,
      };

      rows.push(pdfRow);

      if (index === 0) {
        body.push([
          pdfRow.data,
          pdfRow.parcela,
          pdfRow.equipe,
          pdfRow.rua,
          pdfRow.cachoPl,
          pdfRow.cocosDeixados,
          pdfRow.responsavel,
          pdfRow.observacao,
        ]);
        return;
      }

      body.push([
        pdfRow.data,
        pdfRow.parcela,
        pdfRow.equipe,
        pdfRow.rua,
        pdfRow.cachoPl,
        pdfRow.cocosDeixados,
        pdfRow.responsavel,
        pdfRow.observacao,
      ]);
    });
  });

  for (let index = 0; index < page.blankRows; index += 1) {
    const blankRow = createBlankPdfRow();
    rows.push(blankRow);
    body.push([
      blankRow.data,
      blankRow.parcela,
      blankRow.equipe,
      blankRow.rua,
      blankRow.cachoPl,
      blankRow.cocosDeixados,
      blankRow.responsavel,
      blankRow.observacao,
    ]);
  }

  return {
    body,
    rows,
  };
};

export const createRelatorioPdfBlob = ({
  dataTitulo,
  referenteLabel,
  footerCode,
  printPages,
}) => {
  const doc = new jsPDF({
    format: 'a4',
    orientation: 'portrait',
    unit: 'mm',
  });

  printPages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage();
    }

    const { body, rows: pageRows } = createPdfRows(page);
    const observacaoSegments = new Map();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(TITLE_FONT_SIZE);
    doc.text('Controle de Qualidade de Colheita', doc.internal.pageSize.getWidth() / 2, PAGE_TITLE_Y, {
      align: 'center',
    });

    doc.setFontSize(SUBTITLE_FONT_SIZE);
    doc.text(buildSubtitleText(dataTitulo, referenteLabel), doc.internal.pageSize.getWidth() / 2, PAGE_SUBTITLE_Y, {
      align: 'center',
    });

    autoTable(doc, {
      startY: PAGE_TABLE_START_Y,
      head: [TABLE_COLUMNS.map((column) => column.header)],
      body,
      theme: 'grid',
      margin: {
        left: PAGE_MARGIN_X,
        right: PAGE_MARGIN_X,
      },
      styles: {
        cellPadding: 1.2,
        font: 'helvetica',
        fontSize: BODY_FONT_SIZE,
        halign: 'center',
        lineColor: BORDER_COLOR,
        lineWidth: 0.2,
        minCellHeight: ROW_HEIGHT_MM,
        textColor: TEXT_COLOR,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        fontSize: HEADER_FONT_SIZE,
        fontStyle: 'bold',
        halign: 'center',
        lineColor: BORDER_COLOR,
        lineWidth: 0.2,
        textColor: TEXT_COLOR,
        valign: 'middle',
      },
      columnStyles: TABLE_COLUMN_STYLES,
      didParseCell: (hook) => {
        if (hook.section !== 'body') {
          return;
        }

        const row = pageRows[hook.row.index];
        const key = TABLE_COLUMNS[hook.column.index]?.dataKey;

        if (!row || !key) {
          return;
        }

        if (
          (key === 'cachoPl' && row.highlightCacho) ||
          (key === 'cocosDeixados' && row.highlightCocos)
        ) {
          hook.cell.styles.fillColor = MARKER_FILL;
          hook.cell.styles.textColor = MARKER_TEXT;
          hook.cell.styles.fontStyle = 'bold';
        }

        if (key === 'responsavel' || key === 'observacao') {
          const rawText = Array.isArray(hook.cell.text)
            ? hook.cell.text.join(' ')
            : String(hook.cell.text || '');
          const textLen = rawText.replace(/\s+/g, ' ').trim().length;
          if (textLen > 70) {
            hook.cell.styles.fontSize = 6.2;
          } else if (textLen > 40) {
            hook.cell.styles.fontSize = 7.2;
          }
        }
      },
      didDrawCell: (hook) => {
        if (hook.section !== 'body') {
          return;
        }

        const row = pageRows[hook.row.index];
        const key = TABLE_COLUMNS[hook.column.index]?.dataKey;

        if (
          !row ||
          key !== 'observacao' ||
          !row.observacaoSegmentKey ||
          row.observacaoSegmentRowCount <= OBSERVACAO_TOP_ROWS ||
          row.observacaoSegmentRowIndex < OBSERVACAO_TOP_ROWS
        ) {
          return;
        }

        const segment = observacaoSegments.get(row.observacaoSegmentKey) || {
          text: '',
          cells: [],
        };

        if (row.observacaoVerticalText) {
          segment.text = row.observacaoVerticalText;
        }

        segment.cells.push({
          x: hook.cell.x,
          y: hook.cell.y,
          width: hook.cell.width,
          height: hook.cell.height,
        });
        observacaoSegments.set(row.observacaoSegmentKey, segment);

        if (row.observacaoSegmentRowIndex === row.observacaoSegmentRowCount - 1) {
          drawVerticalObservacaoPdf(doc, segment);
          observacaoSegments.delete(row.observacaoSegmentKey);
        }
      },
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FOOTER_FONT_SIZE);
    doc.text(footerCode, PAGE_MARGIN_X, PAGE_FOOTER_Y);
  });

  return doc.output('blob');
};
