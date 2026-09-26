/**
 * KelasKu — tiny XLSX writer
 * Creates a standards-compatible .xlsx workbook without external libraries.
 * Uses uncompressed ZIP entries to keep the runtime small and deterministic.
 */

const encoder = new TextEncoder();

function xmlEsc(value='') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
}
function colName(index){
  let n=index+1,out='';
  while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);}
  return out;
}
function cellXml(value,row,col,style=0){
  if(value===null||value===undefined||value==='')return '';
  const ref=`${colName(col)}${row}`;
  const styleAttr=style?` s="${style}"`:'';
  if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  if(typeof value==='boolean')return `<c r="${ref}" t="b"${styleAttr}><v>${value?1:0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
}
function normalizeCell(value){
  if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.prototype.hasOwnProperty.call(value,'v'))return value;
  return {v:value,style:0};
}
function worksheetXml(rows=[]){
  const widths=[];
  rows.forEach(row=>(row||[]).forEach((raw,i)=>{const {v}=normalizeCell(raw);const len=Math.min(42,Math.max(8,String(v??'').length+2));widths[i]=Math.max(widths[i]||8,len);}));
  const cols=widths.length?`<cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`:'';
  const sheetRows=rows.map((row,ri)=>`<row r="${ri+1}">${(row||[]).map((raw,ci)=>{const c=normalizeCell(raw);return cellXml(c.v,ri+1,ci,c.style||0);}).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`;
}
function stylesXml(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

let crcTable=null;
function getCrcTable(){
  if(crcTable)return crcTable;
  crcTable=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}
  return crcTable;
}
function crc32(bytes){let c=0xFFFFFFFF;const t=getCrcTable();for(const b of bytes)c=t[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
function concat(parts){const len=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(len);let off=0;for(const p of parts){out.set(p,off);off+=p.length;}return out;}
function dosStamp(){const d=new Date(),year=Math.max(1980,d.getFullYear());return {time:((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,date:(((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF};}
function zipStore(files){
  const locals=[],centrals=[];let offset=0;const stamp=dosStamp();
  files.forEach(file=>{
    const name=encoder.encode(file.name),data=typeof file.data==='string'?encoder.encode(file.data):file.data,crc=crc32(data);
    const local=concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(stamp.time),u16(stamp.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    locals.push(local);
    const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(stamp.time),u16(stamp.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    centrals.push(central);offset+=local.length;
  });
  const centralBlob=concat(centrals);const end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBlob.length),u32(offset),u16(0)]);
  return concat([...locals,centralBlob,end]);
}
function safeSheetName(name,index,used){
  let base=String(name||`Sheet${index+1}`).replace(/[\\/*?:\[\]]/g,' ').replace(/\s+/g,' ').trim()||`Sheet${index+1}`;
  base=base.slice(0,31);let out=base,n=2;while(used.has(out.toLowerCase())){const suffix=` ${n++}`;out=base.slice(0,31-suffix.length)+suffix;}used.add(out.toLowerCase());return out;
}

export function downloadXlsx(filename,sheets=[]){
  const used=new Set();
  const normalized=(sheets.length?sheets:[{name:'Sheet1',rows:[]}]).map((sheet,i)=>({name:safeSheetName(sheet.name,i,used),rows:sheet.rows||[]}));
  const workbookSheets=normalized.map((s,i)=>`<sheet name="${xmlEsc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
  const rels=normalized.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('');
  const styleRid=normalized.length+1;
  const files=[
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${normalized.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${styleRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml',data:stylesXml()},
    ...normalized.map((sheet,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:worksheetXml(sheet.rows)}))
  ];
  const bytes=zipStore(files);const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename.endsWith('.xlsx')?filename:`${filename}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export const xlsxCell = (v,style=0)=>({v,style});
