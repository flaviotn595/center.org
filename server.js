const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const http = require('http');
const socketIO = require('socket.io');
const moment = require('moment-timezone');
const multer = require('multer');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = 4198;

let tableData = [];
let allData = {};
let monthlyVolumes = {}; // Para armazenar o volume total por mês

// Estado inicial das docas
let dockStatus = {};
for (let i = 41; i <= 65; i++) {
    dockStatus[i] = 'Livre';
}

app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use(express.static('dg'));

// Diretório de salvamento dos arquivos
const savesDirectory = path.join(__dirname, 'saves');
if (!fs.existsSync(savesDirectory)) {
    fs.mkdirSync(savesDirectory);
}

// Configuração do Multer para upload de arquivos
const upload = multer({ dest: 'saves/' });

// // Função para normalizar os nomes removendo acentos e convertendo para minúsculas
function normalizeName(name) {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
const dadosPath = path.join(__dirname, 'jsons', 'dados.json');
const dados2Path = path.join(__dirname, 'jsons', 'dados2.json');
const filePath = path.join(__dirname, 'jsons', 'dados.json');
const filePath2 = path.join(__dirname, 'jsons', 'dados2.json'); // Caminho para o segundo arquivo JSON


const dataFilePath = path.join(__dirname, 'jsons/dados.json');
const dataFilePath2 = path.join(__dirname, 'jsons/dados2.json');

// Função para mapear nomes semelhantes para um nome padrão
const nameMappings = {
    'robson': 'Robson',
    'erik': 'Erik',
    'erick': 'Erik',
    'mirella': 'Mirella',
    'flavio': 'Flavio',
    'flávio': 'Flavio',
    'Alvaro': 'Álvaro',
    'alex': 'Alex',
    'diogo': 'Diogo',
    'rogério': 'Rogério',
    'rogerio': 'Rogério',  // Rogério sem prefixo é uma pessoa distinta
    'j rogerio': 'Jose Rogerio',
    'jose rogerio': 'Jose Rogerio',
    'josé rogerio': 'Jose Rogerio',
    'J Rogério': 'J. ROGERIO',
    'romario': 'Romario',
    'romário': 'Romario',
    'Mateus': 'Alex',
    'duda': 'Duda',
    'josenildo': 'Josenildo',
    'daniel': 'Daniel',
    'dário': 'Dario',
    'dario': 'Dario',
    'isaque': 'Isaque', // Unificando Isaque e Isac
    'isac': 'Isaque', // Unificando Isaque e Isac
    'issacar': 'Issacar', // Issacar é distinto
    'bruno': 'Bruno',
    'rafaela': 'Rafaela',
    'ryan': 'Ryan',
    'willyam': 'William', // Unificando Willyam e William
    'william': 'William',
    'wilson': 'Wilson',
    'elton': 'Elton'
};

// Função para mapear nomes para um padrão
function mapName(name) {
    const normalized = normalizeName(name);
    return nameMappings[normalized] || name;
}

// Exemplo de uso
const nomes = [
    "Robson", "Erik", "Mirella", "Flavio", "Alex", "Diogo",
    "Álvaro",
    "Rogério", "J Rogério", "José Rogério", "Romário", "Mateus",
    "Erick", "Duda", "Josenildo", "Daniel", "Dário", "Isaque", "Bruno",
    "Rafaela", "Ryan", "Issacar", "Willyam", "Isac", "Wilson", "Elton"
];

const nomesUnificados = nomes.map(mapName);
console.log(nomesUnificados);



// Função para extrair a data do nome do arquivo
function extractDateFromFileName(fileName) {
    const datePattern = /Data - (\d{2})-(\d{2})-(\d{4})____Hora - \d{2}-\d{2}-\d{2}/;
    const match = fileName.match(datePattern);
    if (match) {
        const day = match[1];
        const month = match[2];
        const year = match[3];
        return `${year}-${month}`;
    }
    return null;
}

// Função para converter o número do turno em texto
function mapTurno(turnoNumber) {
    if (turnoNumber === 1) return "Manhã";
    if (turnoNumber === 2) return "Tarde";
    return "Indefinido";
}

function readJsonFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
    });
  });
}

// Função para salvar arquivos JSON
function saveJsonFile(filePath, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


// Função para processar arquivos na pasta saves
function processFiles() {
    const files = fs.readdirSync(savesDirectory);
    allData = {}; // Resetando dados anteriores
    monthlyVolumes = {}; // Resetando os volumes mensais

    files.forEach(file => {
        const filePath = path.join(__dirname, 'saves', file);
        const date = extractDateFromFileName(file); // Extraindo a data do nome do arquivo
        if (!date) {
            console.log(`Data não encontrada no nome do arquivo: ${file}`);
            return; // Ignorar arquivos sem data válida no nome
        }

        const workbook = XLSX.readFile(filePath);
        
        workbook.SheetNames.forEach(sheetName => {
            const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                defval: '', // Define valores padrão como string vazia em vez de null
            });

            console.log(`Processando planilha: ${sheetName} do arquivo: ${file}`);
            
            // Agrupar dados por conferente e somar os volumes, separando por mês e turno
            sheetData.forEach(row => {
                let volume = parseFloat(row['Volume']) || 0;
                let conferente = row['Conferente'].trim();
                let turnoNumber = parseInt(row['Turno']);

                let turno = mapTurno(turnoNumber); // Mapeia o número do turno para "Manhã" ou "Tarde"

                // Filtrar apenas volumes com 5 dígitos ou menos
                if (conferente && volume <= 99999 && turno !== "Indefinido") {
                    // Normalizar e mapear o nome do conferente
                    let mappedConferente = mapName(conferente);
                    
                    // Extrair o mês e o ano da data
                    let monthKey = date.slice(0, 7); // Garantindo que estamos pegando 'YYYY-MM'

                    if (!allData[monthKey]) {
                        allData[monthKey] = {};
                        monthlyVolumes[monthKey] = 0; // Inicializar o volume total do mês
                    }

                    if (!allData[monthKey][turno]) {
                        allData[monthKey][turno] = {};
                    }

                    if (!allData[monthKey][turno][mappedConferente]) {
                        allData[monthKey][turno][mappedConferente] = { originalName: conferente, totalVolume: volume };
                    } else {
                        allData[monthKey][turno][mappedConferente].totalVolume += volume;
                    }

                    // Somar o volume ao total do mês
                    monthlyVolumes[monthKey] += volume;
                }
            });
        });
    });
    console.log('Volumes mensais:', monthlyVolumes);
}

// Monitorar a pasta 'saves' para mudanças
chokidar.watch('./saves').on('all', (event, path) => {
    console.log(event, path);
    processFiles();
});

// Rota para receber uploads de arquivos
app.post('/upload', upload.single('file'), (req, res) => {
    res.send('Arquivo enviado com sucesso!');
});

// Rota para servir o arquivo JSON
app.get('/dados-lib', (req, res) => {
    res.sendFile(path.join(__dirname, 'jsons', 'dados.json'));
});

let statusBotoes = {};

io.on('connection', (socket) => {
    console.log("Cliente conectado:", socket.id);

    // Envia o estado inicial para o cliente
    socket.emit('estadoInicial', statusBotoes);

    // Atualiza o status de um botão e a hora de liberação
    socket.on('atualizarStatus', ({ index, novoStatus, dataHora }) => {
        console.log(`Status do botão ${index} atualizado para: ${novoStatus}`);
        statusBotoes[index] = { novoStatus, dataHora };
        io.emit('statusAtualizado', { index, novoStatus, dataHora });
    });

    // Limpa o histórico de status e horas
    socket.on('limparHistorico', () => {
        /*console.log("Limpeza do histórico de botões e horas.");*/
        
        //comit feito para evitar erros de fechamento automatico
        
       // se for posssivel nao mexer nesses detalhe pos esta com um erro grave aguarde ate o momento certo ok
        
        statusBotoes = {}; // Limpa o objeto statusBotoes no servidor
        io.emit('historicoLimpo'); // Emite o evento de limpeza para todos os clientes
    });
});


/*
let statusBotoes = {};

io.on('connection', (socket) => {
    console.log("Cliente conectado:", socket.id);

    socket.emit('estadoInicial', statusBotoes);

    socket.on('atualizarStatus', ({ index, novoStatus }) => {
        console.log(`Status do botão ${index} atualizado para: ${novoStatus}`);
        statusBotoes[index] = novoStatus;
        io.emit('statusAtualizado', { index, novoStatus });
    });
});*/

// Rota para enviar dados para o gráfico de conferente por turno
app.get('/chart/conferente/:month/:turno', (req, res) => {
    const monthKey = req.params.month; // Mês no formato 'YYYY-MM'
    const turno = req.params.turno; // Turno, como "Manhã" ou "Tarde"
    const turnoData = (allData[monthKey] && allData[monthKey][turno]) || {};

    console.log(`Dados para ${monthKey} - ${turno}:`, turnoData);

    const labels = [];
    const data = [];

    Object.keys(turnoData).forEach(conferente => {
        labels.push(turnoData[conferente].originalName);
        data.push(turnoData[conferente].totalVolume);
    });

    console.log(`Labels: ${labels}`);
    console.log(`Data: ${data}`);

    res.json({ labels, data });
});

// Rota para enviar o volume total do mês
app.get('/volume/total/:month', (req, res) => {
    const monthKey = req.params.month; // Mês no formato 'YYYY-MM'
    const totalVolume = monthlyVolumes[monthKey] || 0;

    res.json({ month: monthKey, totalVolume });
});

// Rota para enviar os dados processados ao frontend
app.get('/data/:month', (req, res) => {
    const monthKey = req.params.month; // Mês no formato 'YYYY-MM'
    const monthData = allData[monthKey] || {};

    // Converter os dados para um array de arrays para o DataTable
    const formattedData = Object.keys(monthData).flatMap(turno => {
        return Object.keys(monthData[turno]).map(normalizedConferente => {
            return [monthData[turno][normalizedConferente].totalVolume, monthData[turno][normalizedConferente].originalName];
        });
    });

    res.json(formattedData);
});

function getCurrentDateFormatted() {
    const currentDate = moment().tz('America/Sao_Paulo');
    const day = currentDate.format('DD');
    const month = currentDate.format('MM');
    const year = currentDate.format('YYYY');
    const hours = currentDate.format('HH');
    const minutes = currentDate.format('mm');
    const seconds = currentDate.format('ss');
    return `Data - ${day}-${month}-${year}____Hora - ${hours}-${minutes}-${seconds} - segundos`;
}

function updateCounts(data) {
    let fCount = 0;
    let nfCount = 0;
    let turno1Count = 0;
    let turno2Count = 0;

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const dataCell = row[0].trim();
        const statusCell = row[12].trim(); // Coluna Status foi ajustada para a nova posição
        const turnoCell = row[4].trim();
        
        if (dataCell) {
            if (statusCell === 'F') {
                fCount++;
            } else {
                nfCount++;
            }
        }
        
        if (turnoCell === '1') {
            turno1Count++;
        } else if (turnoCell === '2') {
            turno2Count++;
        }
    }
    return { fCount, nfCount, turno1Count, turno2Count };
}
/*
app.post('/save', (req, res) => {
    tableData = req.body.data;
    const counts = updateCounts(tableData);
    io.emit('updateCount', counts);
    io.emit('updateTable', tableData); // Emite o evento para atualizar a tabela inteira
    io.emit('updateRanking');
    res.send({ message: 'Dados salvos localmente!' });
});*/

app.post('/save', (req, res) => {
    tableData = req.body.data;
    const counts = updateCounts(tableData);

    // Salva os dados no localstore e atualiza a interface em tempo real
    io.emit('updateCount', counts);
    io.emit('updateTable', tableData);
    io.emit('updateRanking');

    // Caminho para o arquivo JSON
    const filePath = path.join(__dirname, 'jsons', 'dados.json');

    // Grava os dados no arquivo JSON
    fs.writeFile(filePath, JSON.stringify(tableData, null, 2), (err) => {
        if (err) {
            console.error('Erro ao salvar os dados no arquivo JSON:', err);
            return res.status(500).send({ message: 'Erro ao salvar os dados no arquivo.' });
        }
        res.send({ message: 'Dados salvos localmente e no arquivo JSON!' });
    });
});


app.post('/save', (req, res) => {
    const tableData = req.body.data; // Dados recebidos do cliente

    // Lê o arquivo JSON existente
    const jsonFilePath = path.join(__dirname, 'jsons', 'dados.json');

    fs.readFile(jsonFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Erro ao ler o arquivo JSON:', err);
            return res.status(500).send({ message: 'Erro ao ler o arquivo JSON' });
        }

        // Converte o conteúdo lido de volta em um array
        let jsonArray;
        try {
            jsonArray = JSON.parse(data);
        } catch (parseError) {
            console.error('Erro ao parsear o arquivo JSON:', parseError);
            return res.status(500).send({ message: 'Erro ao processar o arquivo JSON' });
        }

        // Adiciona os novos dados ao JSON existente
        jsonArray = jsonArray.concat(tableData); // Combina dados existentes e novos

        // Escreve os dados atualizados de volta no arquivo JSON
        fs.writeFile(jsonFilePath, JSON.stringify(jsonArray, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Erro ao salvar o arquivo JSON:', writeErr);
                return res.status(500).send({ message: 'Erro ao salvar o arquivo JSON' });
            }

            // Emite eventos para atualizar os dados
            const counts = updateCounts(jsonArray); // Atualiza os contadores
            io.emit('updateCount', counts);
            io.emit('updateTable', jsonArray); // Emite o evento para atualizar a tabela inteira
            io.emit('updateRanking');

            console.log('Dados salvos no arquivo JSON com sucesso!');
            res.send({ message: 'Dados salvos localmente!' });
        });
    });
});


// Rota para obter dados do JSON
app.get('/dados', (req, res) => {
  const filePath = path.join(__dirname, 'jsons', 'dados.json');

  // Lê o arquivo JSON
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Erro ao ler o arquivo JSON:', err);
      return res.status(500).send({ message: 'Erro ao ler o arquivo.' });
    }

    try {
      const jsonData = JSON.parse(data);
      res.send(jsonData); // Envia os dados para o frontend
    } catch (parseError) {
      console.error('Erro ao analisar o JSON:', parseError);
      res.status(500).send({ message: 'Erro ao analisar o JSON.' });
    }
  });
});

app.post('/finalize', (req, res) => {
    const data = req.body.data;
    tableData = data;

    const fileName = `${getCurrentDateFormatted()}.xlsx`;

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const filePath = path.join(savesDirectory, fileName);
    XLSX.writeFile(wb, filePath);

    io.emit('updateTable', tableData);
    
    // Atualiza as contagens antes de limpar
    const counts = updateCounts(tableData);
    io.emit('updateCount', counts);
    
    // Limpa os dados após o salvamento
    tableData = [];
    io.emit('clearTable'); // Emite um evento para limpar a tabela no cliente

    res.send({ message: 'Arquivo salvo com sucesso!' });
});

app.delete('/limparDados', (req, res) => {
  // Deletar o arquivo dados.json
  fs.unlink(dadosPath, (err) => {
    if (err) {
      console.error('Erro ao deletar dados.json:', err);
      return res.status(500).send('Erro ao deletar dados.json');
    }

    // Deletar o arquivo dados2.json
    fs.unlink(dados2Path, (err) => {
      if (err) {
        console.error('Erro ao deletar dados2.json:', err);
        return res.status(500).send('Erro ao deletar dados2.json');
      }

      res.send('Dados limpos com sucesso e arquivos deletados.');
    });
  });
});

app.get('/dados', (req, res) => {
  fs.readFile(path.join(__dirname, 'jsons/dados.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Erro ao ler o arquivo de dados.');
    }
    res.send(JSON.parse(data));
  });
});

app.get('/dados2', (req, res) => {
  fs.readFile(path.join(__dirname, 'jsons/dados2.json'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Erro ao ler o arquivo de dados2.');
    }
    res.send(JSON.parse(data));
  });
});

// Salvar status e hora de liberação em dados2.json
app.post('/atualizarStatus', express.json(), async (req, res) => {
  try {
    const { motorista, doca, status, hora } = req.body;

    const dados2 = await readJsonFile(dataFilePath2);

    // Verifica se já existe uma entrada para o motorista e a doca
    const existingEntry = dados2.find(item => item.motorista === motorista && item.doca === doca);
    if (existingEntry) {
      existingEntry.status = status;
      existingEntry.hora = hora;
    } else {
      // Adiciona uma nova entrada
      dados2.push({ motorista, doca, status, hora });
    }

    // Salva no arquivo dados2.json
    await saveJsonFile(dataFilePath2, dados2);

    // Emite o status atualizado para todos os clientes conectados
    io.emit('statusAtualizado', { motorista, doca, status, hora });

    res.status(200).send('Status atualizado com sucesso');
  } catch (err) {
    console.error('Erro ao atualizar o status:', err);
    res.status(500).send('Erro ao atualizar o status');
  }
});

app.post('/clear', (req, res) => {
    tableData = []; // Limpa os dados salvos
    io.emit('clearTable'); // Emite um evento para limpar a tabela no cliente
    io.emit('updateCount', { fCount: 0, nfCount: 0, turno1Count: 0, turno2Count: 0 }); // Reseta as contagens no cliente
    res.send({ message: 'Tabela limpa com sucesso!' });
});

app.get('/list-files', (req, res) => {
    fs.readdir(savesDirectory, (err, files) => {
        if (err) {
            return res.status(500).send({ message: 'Não foi possível verificar os arquivos!' });
        }
        res.send(files);
    });
});

app.delete('/delete-file', (req, res) => {
    const fileName = req.query.name;
    const filePath = path.join(savesDirectory, fileName);

    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).send({ message: 'Erro ao deletar o arquivo!' });
        }
        res.send({ message: 'Arquivo deletado com sucesso!' });
    });
});

app.use('/saves', express.static(savesDirectory));  // Certifique-se de que essa linha está correta

io.on('connection', (socket) => {
    console.log('Novo cliente conectado');
    socket.emit('updateTable', tableData);
    socket.emit('initialStatus', dockStatus);

    // Envia a contagem inicial ao cliente recém-conectado
    const counts = updateCounts(tableData);
    socket.emit('updateCount', counts);

    socket.on('updateData', (data) => {
        tableData = data;
        io.emit('updateTable', tableData);
    });

    // Atualizações do status das docas
    socket.on('updateStatus', (data) => {
        const { dock, status } = data;
        dockStatus[dock] = status;
        io.emit('statusUpdated', { dock, status });
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

io.on('connection', (socket) => {
    console.log('Novo cliente conectado');

    // Função para normalizar o nome
    function normalizeName(name) {
        return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    // Solicitar os dados de conferentes e volumes
    socket.on('requestTableData', () => {
        const volumeMap = {};

        tableData.forEach(row => {
            const conferente = normalizeName(row[3]); // Normaliza o nome do conferente
            const volume = parseFloat(row[6]) || 0; // Volume na sétima coluna (índice 6)

            if (conferente && !isNaN(volume)) {
                if (!volumeMap[conferente]) {
                    volumeMap[conferente] = 0;
                }
                volumeMap[conferente] += volume;
            }
        });

        const resultData = Object.entries(volumeMap).map(([conferente, totalVolume]) => [conferente, totalVolume]);
        socket.emit('updateTable', resultData);
    });
});


// Monitorar a pasta 'saves' para mudanças
chokidar.watch('./saves').on('all', (event, path) => {
    console.log(event, path);
    processFiles();
});

// Iniciar o servidor
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
