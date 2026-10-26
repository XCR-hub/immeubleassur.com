from pathlib import Path
from zipfile import ZipFile
from xml.dom import minidom
path=Path(__file__).resolve().parent.parent/'resources'/'mma'/'questionnaire-immeuble.docx'
with ZipFile(path) as archive:
    entries=[(entry,archive.read(entry.filename)) for entry in archive.infolist()]
doc=minidom.parseString(dict((entry.filename,data) for entry,data in entries)['word/document.xml'])
paragraphs=list(doc.getElementsByTagName('w:p'))
values={11:'Nom de l’agence/cabinet : {{broker_name}}',12:'Nom et prénom du représentant : {{broker_representative}}',13:'Code ORIAS : {{broker_orias}}',14:'Adresse : {{broker_address}}',15:'Commune : {{broker_city}}     Code postal : {{broker_postcode}}',17:'E-mail : {{broker_email}}',18:'Téléphone : {{broker_phone}}',19:'Code intermédiaire : {{broker_code}}',28:'Nom de la résidence : {{residence_name}}',29:'N° d’immatriculation de la copropriété : {{copro_registration}}',30:'N° SIREN : {{insured_siren}}',31:'Adresse ou adresses : {{risk_address}}',32:'Code postal : {{risk_postcode}}',33:'Commune : {{risk_city}}',35:'Nom/Dénomination sociale : {{representative_name}}',36:'N° SIREN : {{representative_siren}}',37:'Adresse : {{representative_address}}',38:'Code postal : {{representative_postcode}}',39:'Commune : {{representative_city}}'}
for index,value in values.items():
    nodes=paragraphs[index].getElementsByTagName('w:t')
    if not nodes:raise ValueError('Modèle Word inattendu')
    for offset,node in enumerate(nodes):
        while node.firstChild:node.removeChild(node.firstChild)
        node.appendChild(doc.createTextNode(value if offset==0 else ''))
        node.setAttribute('xml:space','preserve')
with ZipFile(path,'w') as archive:
    for entry,data in entries:archive.writestr(entry,doc.toxml(encoding='UTF-8') if entry.filename=='word/document.xml' else data)
print('Modèle Word balisé : '+str(len(values))+' champs principaux ; annexes exhaustives générées par le serveur.')
