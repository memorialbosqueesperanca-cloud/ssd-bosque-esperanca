# 📄 Sistema de Sinalização Digital (SSD) - Bosque da Esperança

Sistema automatizado de sinalização para Hall Principal e Salas de Velório, integrando logística operacional (iVertex) e conteúdo memorial (Bubble.io).

## 🎯 Objetivos
- **Hall Principal:** Painel dinâmico (estilo aeroporto) com horários e salas via iVertex.
- **Terminais de Sala:** Exibição de nomes, fotos e QR Codes via Bubble.io.

## 🛠️ Stack Tecnológica
- **Backend:** Node.js (Orquestrador de APIs)
- **Frontend:** HTML5, CSS3, JavaScript ES6
- **Infraestrutura de Ponta:** Raspberry Pi 4/5 (Controladores de Display)
- **Virtualização:** Docker & Docker Compose
- **Hospedagem:** Cloud VPS (Fase 01) -> Servidor Local (Fase 02)

## 📂 Estrutura do Projeto
- `/backend`: Middleware de integração iVertex + Bubble.io.
- `/frontend`: Interfaces de exibição otimizadas para o Modo Kiosk dos Raspberry Pis.
- `/infra`: Configurações de rede, Docker e scripts de auto-inicialização para os controladores.

## ⚙️ Funcionamento do Hardware (Raspberry Pi)
Cada tela do complexo é gerida por um Raspberry Pi ligado via:
1. **Rede:** Cabo CAT6 (VLAN de Sinalização).
2. **Saída:** HDMI para a TV/Monitor.
3. **Software:** Browser em modo *headless* apontando para o servidor central.

## 📺 Configuração do Painel LED

### Especificações do Hardware
- **Modelo:** Painel de LED Profissional WaveOne (Versão Brasileira)
- **Dimensões Físicas:** 3,20 metros de largura x 1,92 metros de altura (aproximadamente 147 polegadas)
- **Resolução Digital:** 640 x 480 pixels
- **Pixel Pitch:** 2.5 mm (distância entre LEDs, influencia nitidez de textos pequenos)
- **Controladora:** V960 (VC4)

### Configurações de Software para Nitidez e Profissionalismo
- **Resolução do Navegador:** Configurar o browser em modo kiosk para 640x480 pixels (otimizado), mas responsivo para outras resoluções com limite de escala para telas widescreen.
- **Tamanhos de Fonte:** Ajustados com clamp() para legibilidade em pixel pitch 2.5mm (mínimos adequados para LED, máximos limitados para evitar excesso em telas grandes).
- **Cores:** Paleta institucional com bom contraste para displays LED (verde #01813D, branco, etc.).
- **Layout:** Responsivo com clamp() e max-width para adaptar a diferentes tamanhos, mantendo similaridade ao painel LED. Versão sala prioriza layout vertical (retrato).
- **Anti-aliasing:** Habilitado automaticamente no navegador para suavização de bordas.

### Instruções de Configuração
1. Conectar o Raspberry Pi à controladora V960 via HDMI.
2. Configurar a resolução do display em 640x480 no software da V960.
3. Executar o navegador em modo fullscreen apontando para `http://servidor:5000` (hall) ou `http://servidor:5000/sala/:id` (sala).
4. Garantir que o navegador esteja em modo kiosk sem barras de ferramentas.

---
**Responsável Técnico:** Luiza Peixoto TI
