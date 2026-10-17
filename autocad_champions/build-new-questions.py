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
assert [q['id'] for q in rows]==list(range(41,81))
rng=random.Random(1640)
positions=list(range(5))*8;rng.shuffle(positions)
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
target=out/'AutoCAD_Champions_40_Novas_Questoes_41_a_80.pdf'
story=[Paragraph('AutoCAD Champions',title),Paragraph('Mais 40 questões para revisão do professor',bold),Paragraph('Questões 41 a 68: situações práticas de desenho 2D, precisão, dimensões e interpretação. Questões 69 a 80: fundamentos de modelagem 3D no AutoCAD com recursos de sólidos. Cada questão tem cinco alternativas, uma resposta correta e uma justificativa curta.',body),Spacer(1,7),Paragraph('Proposta para revisão | 16 de outubro de 2026',small),Spacer(1,8)]
for q in rows:
 if q['id'] in (41,69):story.append(Paragraph('Situações práticas em 2D' if q['id']==41 else 'Fundamentos de modelagem 3D',heading))
 items=[Paragraph(escape(f"{q['id']}. {q['question']}"),bold)]
 for i,option in enumerate(q['options']):items.append(Paragraph(escape(f'{chr(65+i)}) {option}'),body))
 items.extend([Spacer(1,5),Paragraph(escape(f"Gabarito: {chr(65+q['answer'])}) {q['correct']}"),bold),Paragraph(escape('Comentário: '+q['why']),comment),Spacer(1,15)])
 story.append(KeepTogether(items))
story.append(Paragraph('Referências técnicas',heading))
story.append(Paragraph('As questões são originais. Os conceitos de extrusão, operações entre sólidos, UCS e união de segmentos foram conferidos nas referências oficiais abaixo.',small))
sources=[
 ('Autodesk | Extrusão de sólidos e superfícies','https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Core/files/GUID-520D62BD-4408-4708-8DA4-6B31D678058C.htm'),
 ('Autodesk | União subtração e interseção de sólidos','https://www.autodesk.com/blogs/autocad/autocad-3d-editing-tuesday-tips-with-frank/'),
 ('Autodesk | Sistema de coordenadas do usuário UCS','https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Core/files/GUID-E658D5E7-EE5C-4A06-BF34-F71CDB363A71.htm'),
 ('Autodesk | União de objetos 2D','https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT-DidYouKnow/files/GUID-29D46150-7550-420A-B151-73BE44146665.htm')]
for label,url in sources:story.append(Paragraph(f'<link href="{url}" color="#222222">{escape(label)}</link>',small))
def footer(c,doc):
 c.setFont('Arial',8);c.drawString(48,24,'AutoCAD Champions | Proposta de novas questões');c.drawRightString(A4[0]-48,24,str(doc.page))
SimpleDocTemplate(str(target),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=42,bottomMargin=42,title='AutoCAD Champions 40 novas questões de 41 a 80',author='').build(story,onFirstPage=footer,onLaterPages=footer)
pdf=PdfReader(target)
alltext=' '.join(' '.join(p.extract_text().split()) for p in pdf.pages)
for q in rows:
 assert ' '.join(q['question'].split()) in alltext
 for option in q['options']:assert ' '.join(option.split()) in alltext
 assert ' '.join(q['why'].split()) in alltext
qa=root/'qa-novas-questoes';qa.mkdir(exist_ok=True)
images=convert_from_path(str(target),dpi=90,poppler_path=r'C:\Users\m_eri\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin')
for i,image in enumerate(images):image.save(qa/f'page-{i+1}.png')
print(f'Conferido: {len(pdf.pages)} páginas, 40 questões, 200 alternativas e 40 comentários. Gabaritos equilibrados: 8 por letra.')
