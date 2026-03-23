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

---
**Responsável Técnico:** Luiza Peixoto TI
