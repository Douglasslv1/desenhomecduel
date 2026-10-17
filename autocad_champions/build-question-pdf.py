from pathlib import Path
import re,json
from html import escape
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
from pdf2image import convert_from_path
root=Path(__file__).resolve().parent
sql=(root/'questions.sql').read_text(encoding='utf-8-sig')
rows=[(int(i),s.replace("''","'"),json.loads(o.replace("''","'")),int(a)) for i,s,o,a in re.findall(r"\((\d+),'((?:[^']|'')*)','((?:[^']|'')*)'::jsonb,(\d+)\)",sql)]
assert [r[0] for r in rows]==list(range(1,41))
pdfmetrics.registerFont(TTFont('Arial',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold',r'C:\Windows\Fonts\arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='ArialBold')
out=root/'output'/'pdf';out.mkdir(parents=True,exist_ok=True)
target=out/'AutoCAD_Champions_40_Questoes_Revisao.pdf'
c=canvas.Canvas(str(target),pagesize=A4)
c.setTitle('AutoCAD Champions banco de 40 questões para revisão')
w,h=A4;left=50;width=w-100
normal=ParagraphStyle('body',fontName='Arial',fontSize=10.5,leading=13)
bold=ParagraphStyle('bold',parent=normal,fontName='ArialBold')
def para(text,y,style=normal):
 p=Paragraph(escape(text),style);_,ph=p.wrap(width,1000);p.drawOn(c,left,y-ph);return y-ph
for start in range(0,40,4):
 y=h-45
 if start==0:
  c.setFont('ArialBold',21);c.drawString(left,y,'AutoCAD Champions');y-=28
  y=para('Banco de 40 questões para revisão',y,bold)-8
  y=para('Enunciados, alternativas e gabaritos do arquivo de perguntas do campeonato. Use a numeração original para indicar substituições ou modificações.',y)-8
  y=para('Revisão do professor | 16 de outubro de 2026',y)-18
 else:
  y=para(f'AutoCAD Champions | Questões {start+1:02d} a {start+4:02d}',y,bold)-20
 for number,text,options,answer in rows[start:start+4]:
  y=para(text,y,bold)-5
  for option in options:y=para(option,y)
  y-=5;y=para('Gabarito atual: '+options[answer],y,bold)-7
  y=para('Anotações: __________________________________________________________',y)-16
 assert y>45,(start,y)
 c.setFont('Arial',8);c.drawRightString(w-50,25,f'AutoCAD Champions | {start//4+1} / 10')
 c.showPage()
c.save()
qa=root/'qa-questoes-pdf';qa.mkdir(exist_ok=True)
pdf=PdfReader(target);assert len(pdf.pages)==10
all_text=' '.join(' '.join(page.extract_text().split()) for page in pdf.pages)
for _,text,options,answer in rows:
 assert ' '.join(text.split()) in all_text
 for option in options:assert ' '.join(option.split()) in all_text
images=convert_from_path(str(target),dpi=90,poppler_path=r'C:\Users\m_eri\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin')
for i,page in enumerate(images):page.save(qa/f'page-{i+1}.png')
print('PDF conferido: 10 páginas, 40 questões, 200 alternativas, 40 gabaritos.')
