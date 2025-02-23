// Função para carregar os dados do JSON e preencher a tabela
async function carregarDados() {
    try {
        // Tenta ler os dados do localStorage
        const localData = localStorage.getItem('tableData');
        let tableData;

        if (localData) {
            // Se os dados estão no localStorage, use-os
            tableData = JSON.parse(localData);
        } else {
            // Se não, busque os dados do servidor
            const response = await fetch('/dados');
            tableData = await response.json();
        }

        const tableBody = document.getElementById('motoristasDocaTable').querySelector('tbody');
        tableBody.innerHTML = ''; // Limpa o conteúdo anterior

        for (let i = 1; i < tableData.length; i++) {
            const motorista = tableData[i][2]; // Motorista está no índice 2
            const doca = tableData[i][9]; // Doca está no índice 9

            if (motorista && doca) {
                const row = document.createElement('tr');

                const motoristaCell = document.createElement('td');
                motoristaCell.textContent = motorista;

                const docaCell = document.createElement('td');
                docaCell.textContent = doca;

                const statusCell = document.createElement('td');
                const button = document.createElement('button');
                button.textContent = 'Aguardando Liberação';

                // Evento de clique para mudar o estado do botão
                button.addEventListener('click', () => {
                    if (button.textContent === 'Aguardando Liberação') {
                        button.textContent = 'Liberado';
                        button.classList.add('liberado');
                    }
                });

                statusCell.appendChild(button);
                row.appendChild(motoristaCell);
                row.appendChild(docaCell);
                row.appendChild(statusCell);
                tableBody.appendChild(row);
            }
        }
    } catch (error) {
        console.error('Erro ao carregar os dados:', error);
    }
}

// Função para salvar dados no localStorage
function salvarDadosNoLocalStorage(data) {
    localStorage.setItem('tableData', JSON.stringify(data));
}

// Modifique a rota de salvar para também atualizar o localStorage
app.post('/save', (req, res) => {
    const tableData = req.body.data;

    const counts = updateCounts(tableData);
    io.emit('updateCount', counts);
    io.emit('updateTable', tableData);
    io.emit('updateRanking');

    const jsonFilePath = path.join(__dirname, 'jsons', 'dados.json');

    fs.readFile(jsonFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Erro ao ler o arquivo JSON:', err);
            return res.status(500).send({ message: 'Erro ao ler o arquivo JSON' });
        }

        let jsonArray = JSON.parse(data);
        jsonArray = [jsonArray[0]].concat(tableData);

        fs.writeFile(jsonFilePath, JSON.stringify(jsonArray, null, 2), (err) => {
            if (err) {
                console.error('Erro ao salvar o arquivo JSON:', err);
                return res.status(500).send({ message: 'Erro ao salvar o arquivo JSON' });
            }

            console.log('Dados salvos no arquivo JSON com sucesso!');
            salvarDadosNoLocalStorage(jsonArray); // Salva os dados no localStorage
            res.send({ message: 'Dados salvos localmente!' });
        });
    });
});

// Chama a função para carregar os dados ao carregar a página
window.onload = carregarDados;
