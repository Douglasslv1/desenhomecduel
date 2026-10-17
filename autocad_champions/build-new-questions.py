from pathlib import Path
import json,random
from html import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
from pdf2image import convert_from_path

root=Path(__file__).resolve().parent
rows=json.loads((root/'novas-questoes.json').read_text(encoding='utf-8'))
assert [q['id'] for q in rows]==[41,42,43,44,45,47,54,55,56,58,62,63,64,67,80]
rng=random.Random(1640)
positions=list(range(5))*3;rng.shuffle(positions)
for q,pos in zip(rows,positions):
 assert len(q['options'])==5 and len(set(q['options']))==5 and q['correct'] in q['options']
 wrong=[a for a in q['options'] if a!=q['correct']];rng.shuffle(wrong)
 wrong.insert(pos,q['correct']);q['options']=wrong;q['answer']=pos
pdfmetrics.registerFont(TTFont('Arial',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold',r'C:\Windows\Fonts\arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='ArialBold')
body=ParagraphStyle('body',fontName='Arial',fontSize=10.5,leading=13.5)
bold=ParagraphStyle('bold',parent=body,fontName='ArialBold',spaceAfter=6)
title=ParagraphStyle('title',parent=bold,fontSize=21,leading=25,spaceAfter=8)
heading=ParagraphStyle('heading',parent=bold,fontSize=14,leading=18,spaceBefore=8,spaceAfter=10)
comment=ParagraphStyle('comment',parent=body,fontSize=9.5,leading=12,textColor=HexColor('#444444'),spaceBefore=4)
small=ParagraphStyle('small',parent=body,fontSize=8.5,leading=11,spaceAfter=8)
out=root/'output'/'pdf';out.mkdir(parents=True,exist_ok=True)
target=out/'AutoCAD_Champions_15_Questoes_Aprovadas.pdf'
story=[Paragraph('AutoCAD Champions',title),Paragraph('15 questões aprovadas para ampliar o banco',bold),Paragraph('Seleção do professor, preservando os números originais da proposta. A questão 47 usa o nome ARRAY. Cada questão tem cinco alternativas, uma resposta correta e uma justificativa curta.',body),Spacer(1,7),Paragraph('Seleção aprovada | 17 de outubro de 2026',small),Spacer(1,8)]
for q in rows:
 if q['id'] in (41,80):story.append(Paragraph('Situações práticas em 2D' if q['id']==41 else 'Visualização de modelos 3D',heading))
 items=[Paragraph(escape(f"{q['id']}. {q['question']}"),bold)]
 for i,option in enumerate(q['options']):items.append(Paragraph(escape(f'{chr(65+i)}) {option}'),body))
 items.extend([Spacer(1,5),Paragraph(escape(f"Gabarito: {chr(65+q['answer'])}) {q['correct']}"),bold),Paragraph(escape('Comentário: '+q['why']),comment),Spacer(1,15)])
 story.append(KeepTogether(items))
story.append(Paragraph('Referências técnicas',heading))
story.append(Paragraph('As questões são originais. Referência oficial para o comando de replicação circular e retangular utilizado na questão 47.',small))
sources=[('Autodesk | Caixa de diálogo Array','https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-Core/files/GUID-661CF0F1-F856-47E6-9604-D436F47CA70A.htm')]
for label,url in sources:story.append(Paragraph(f'<link href="{url}" color="#222222">{escape(label)}</link>',small))
def footer(c,doc):
 c.setFont('Arial',8);c.drawString(48,24,'AutoCAD Champions | Proposta de novas questões');c.drawRightString(A4[0]-48,24,str(doc.page))
SimpleDocTemplate(str(target),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=42,bottomMargin=42,title='AutoCAD Champions 15 questões aprovadas',author='').build(story,onFirstPage=footer,onLaterPages=footer)
pdf=PdfReader(target)
alltext=' '.join(' '.join(p.extract_text().split()) for p in pdf.pages)
for q in rows:
 assert ' '.join(q['question'].split()) in alltext
 for option in q['options']:assert ' '.join(option.split()) in alltext
 assert ' '.join(q['why'].split()) in alltext
qa=root/'qa-questoes-aprovadas';qa.mkdir(exist_ok=True)
images=convert_from_path(str(target),dpi=90,poppler_path=r'C:\Users\m_eri\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin')
for i,image in enumerate(images):image.save(qa/f'page-{i+1}.png')
print(f'Conferido: {len(pdf.pages)} páginas, 15 questões, 75 alternativas e 15 comentários. Gabaritos equilibrados: 3 por letra.')
