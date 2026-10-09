import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {Workbook,SpreadsheetFile} from "@oai/artifact-tool";
const require=createRequire(import.meta.url),XLSX=require("../web/vendor/xlsx.full.min.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),output=path.join(root,"test-output/family-report-template");
await fs.mkdir(output,{recursive:true});
const book=Workbook.create(),sheet=book.worksheets.add("Learning story");
sheet.showGridLines=false;sheet.tabColor="#C90024";
sheet.getRange("A1:L85").format={fill:"#FFFFFF",font:{name:"Arial",size:11,color:"#262A32"},verticalAlignment:"center"};
sheet.getRange("A1:L85").format.rowHeight=18;
sheet.getRange("A1:A85").format.columnWidth=3;
sheet.getRange("B1:K85").format.columnWidth=10;
sheet.getRange("L1:L85").format.columnWidth=3;
sheet.mergeCells("G2:K3");sheet.getRange("G2").values=[["English learning"]];sheet.getRange("G2").format.font={name:"Arial",size:14,color:"#C90024",bold:true};
sheet.mergeCells("G4:K5");sheet.getRange("G4").values=[["1 September – 30 November 2026"]];sheet.getRange("G4").format.font={name:"Arial",size:10,color:"#636976"};
sheet.getRange("B6:K6").format.borders={bottom:{style:"thin",color:"#E8D9DE"}};
sheet.mergeCells("B7:K8");sheet.getRange("B7").values=[["Ava’s English journey"]];sheet.getRange("B7").format={font:{name:"Arial",size:18,color:"#262A32",bold:true},wrapText:true};
sheet.mergeCells("B9:K9");sheet.getRange("B9").values=[["EtonHouse Early Years"]];sheet.getRange("B9").format.font={name:"Arial",size:11,color:"#636976"};
sheet.getRange("B10:K10").format.rowHeight=11;
sheet.mergeCells("B27:K28");sheet.getRange("B27").values=[["Shows recorded learning during this report period. A gap means no assessment was recorded."]];sheet.getRange("B27").format={font:{name:"Arial",size:10,color:"#636976"},wrapText:true};
sheet.mergeCells("B30:K30");sheet.getRange("B30").values=[["Words and sentences demonstrated"]];sheet.getRange("B30").format.font={name:"Arial",size:14,color:"#262A32",bold:true};
sheet.mergeCells("B32:K32");sheet.getRange("B32").values=[["September 2026"]];sheet.getRange("B32").format={fill:"#FFF1F4",font:{name:"Arial",size:12,color:"#C90024",bold:true}};
sheet.mergeCells("B34:K34");sheet.getRange("B34").values=[["Words"]];sheet.getRange("B34").format.font={name:"Arial",size:11,color:"#5A8570",bold:true};
for(const range of ["B35:D35","E35:G35","H35:K35"]) {sheet.mergeCells(range);sheet.getRange(range).format={font:{name:"Arial",size:11,color:"#262A32"},wrapText:true,verticalAlignment:"top"};}
sheet.getRange("B35").values=[["hello"]];sheet.getRange("E35").values=[["friend"]];sheet.getRange("H35").values=[["teacher"]];
sheet.mergeCells("B37:K37");sheet.getRange("B37").values=[["Sentence structures"]];sheet.getRange("B37").format.font={name:"Arial",size:11,color:"#5A8570",bold:true};
sheet.mergeCells("B38:K38");sheet.getRange("B38").values=[["Hello, my name is ___."]];sheet.getRange("B38").format={font:{name:"Arial",size:11,color:"#262A32"},wrapText:true,verticalAlignment:"top"};
// These authoring-only swatches supply reusable styles; runtime exports include no swatch cells.
sheet.getRange("B80").values=[["body"]];sheet.getRange("B80").format={font:{name:"Arial",size:11,color:"#262A32"},wrapText:true,verticalAlignment:"top"};
sheet.getRange("B81").values=[["practice"]];sheet.getRange("B81").format={fill:"#F1F5F2",font:{name:"Arial",size:12,color:"#5A8570",bold:true},wrapText:true};
sheet.getRange("B82").values=[["quiet"]];sheet.getRange("B82").format={font:{name:"Arial",size:10,color:"#636976"},wrapText:true,verticalAlignment:"top"};
sheet.getRange("B83").values=[[0]];sheet.getRange("B83").setNumberFormat("0");
sheet.getRange("B84").values=[[new Date("2026-09-01T12:00:00")]];sheet.getRange("B84").setNumberFormat("dd mmm yyyy");
const labels=["7 Sep","14 Sep","21 Sep","28 Sep","5 Oct","12 Oct","19 Oct","26 Oct","2 Nov","9 Nov","16 Nov","23 Nov","30 Nov"];
sheet.getRange("AA1:AE14").values=[["Week","New words demonstrated","New sentence structures demonstrated","Words demonstrated","Sentence structures demonstrated"],...labels.map((label,i)=>[label,i===0?3:i===2?null:2,i===0?1:i===2?null:i%2, null,null])];
for(let row=2;row<=14;row++) {sheet.getRange(`AD${row}:AE${row}`).formulas=[[`=IF(ISNUMBER(AB${row}),SUM($AB$2:AB${row}),"")`,`=IF(ISNUMBER(AC${row}),SUM($AC$2:AC${row}),"")`]];}
for(const [column,title,from,to] of [["AD","Words learned","B11","F26"],["AE","Sentence structures learned","G11","K26"]]) {
  const chart=sheet.charts.add("line",[sheet.getRange("AA1:AA14"),sheet.getRange(`${column}1:${column}14`)]);
  chart.title=title;chart.titleTextStyle.typeface="Arial";chart.titleTextStyle.fontSize=12;chart.hasLegend=false;
  chart.xAxis={axisType:"textAxis",textStyle:{typeface:"Arial",fontSize:10},majorGridlines:null,minorGridlines:null};
  chart.yAxis={numberFormatCode:"0",numberFormatSourceLinked:false,textStyle:{typeface:"Arial",fontSize:10},majorGridlines:{fill:"#E9ECEA",style:"solid",width:0.6},minorGridlines:null};
  chart.setPosition(from,to);
  chart.series.items[0].fill="#C90024";chart.series.items[0].line={fill:"#C90024",style:"solid",width:2.5};
}
const logo=await fs.readFile(path.join(root,"web/assets/etonhouse-logo.png"));
sheet.images.add({dataUrl:`data:image/png;base64,${logo.toString("base64")}`,anchor:{from:{row:1,col:1},extent:{widthPx:235,heightPx:235*339/1166}}});
book.recalculate();
console.log((await book.inspect({kind:"drawing",sheetId:sheet.name,maxChars:1500})).ndjson);
const preview=await book.render({sheetName:sheet.name,range:"A1:L41",scale:1.5,format:"png"});await fs.writeFile(path.join(output,"family-template.png"),new Uint8Array(await preview.arrayBuffer()));
const result=await SpreadsheetFile.exportXlsx(book),templatePath=path.join(output,"Family report template.xlsx");await result.save(templatePath);
const bytes=await fs.readFile(templatePath),zip=XLSX.CFB.read(bytes,{type:"buffer"});
const xml=new TextDecoder().decode(XLSX.CFB.find(zip,"/xl/worksheets/sheet1.xml").content);
const styleAt=cell=>Number(xml.match(new RegExp(`<(?:x:)?c\\b[^>]*r="${cell}"[^>]*s="(\\d+)"`))?.[1] || 0);
const styles=Object.fromEntries(Object.entries({base:"A1",rule:"B6",reportTitle:"G2",dateRange:"G4",name:"B7",className:"B9",caption:"B27",section:"B30",month:"B32",label:"B34",word:"B35",sentence:"B38",body:"B80",practice:"B81",quiet:"B82",number:"B83",date:"B84"}).map(([role,cell])=>[role,styleAt(cell)]));
const parts=zip.FullPaths.filter(name=>/xl\/(charts|drawings|media)\//.test(name));
await fs.writeFile(path.join(root,"web/family-report-template.js"),`// Generated from the local Artifact Tool template builder. No child data.\nwindow.EtonFamilyReportTemplate=${JSON.stringify({base64:bytes.toString("base64"),styles,parts})};\n`);
console.log(JSON.stringify({styles,parts,bytes:bytes.length,templatePath}));
