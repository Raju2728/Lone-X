# Local training specifications — 19 November 2026

Follow-up: an isolated CUDA PyTorch environment was subsequently installed on
E:, its tensor check passed, and a Qwen2.5 0.5B one-step LoRA run succeeded.
The table below preserves the initial inspection; global Python remains
separate from `test-artifacts/training-env`. See the GPU smoke report in docs.

Collected directly from the PC; no serial numbers, account details or credentials
are included. No software was installed during this check.

| Item | Detected value |
| --- | --- |
| Laptop | ASUS TUF Gaming F15 FX506HC |
| CPU | Intel Core i5-11400H, 6 cores / 12 threads |
| RAM | 16 GB installed, approximately 15.74 GiB usable |
| Free RAM at latest check | Approximately 5.86 GiB; changes with running apps |
| GPU | NVIDIA GeForce RTX 3050 Laptop GPU |
| Dedicated GPU memory | 4096 MiB; 3964 MiB free in the query snapshot |
| Compute capability | 8.6 |
| NVIDIA driver | 566.07; Windows reports 32.0.15.6607 |
| GPU status | OK; device error code 0 |
| Driver-advertised CUDA support | 12.7; this is not proof of an installed CUDA Toolkit |
| Windows | Windows 11 Home Single Language, x64, build 26300 |
| Python | 3.13.2, AMD64 |
| Active PyTorch | 2.6.0+cpu; no CUDA build; CUDA unavailable to this Python |
| Training libraries in active Python | Transformers, PEFT, Datasets, Accelerate and bitsandbytes not installed |
| CUDA compiler | nvcc not found on PATH; full toolkit installation not established |
| WSL | Not installed |
| SSD | Micron 2400 NVMe, approximately 512 GB marketed capacity |
| Free E: space | Approximately 60.59 GiB |
| Free C: space at earlier same-day check | Approximately 14.30 GiB; avoid downloads there |

## What this establishes

An NVIDIA GPU is present and NVIDIA-SMI can query it. The earlier zero-device
PyTorch result describes the CPU-only Python installation, not absent hardware.
GPU training is not configured yet. No adapter or trained model was produced.

## Proposed next setup

1. Create a separate Python training environment on E: and keep package/model
   caches, temporary files and checkpoints there.
2. Select compatible CUDA PyTorch and training-library wheels for the NVIDIA
   driver and Python version. Use a separate compatible Python if required;
   preserve existing application environments.
3. Confirm torch.cuda.is_available(), the actual GPU name and a basic tensor
   operation before downloading source weights or starting training.
4. Validate one-step LoRA training on Qwen2.5 0.5B with small sequence/batch sizes.
   Record real VRAM/RAM use and failures; 4 GB does not guarantee success for
   every configuration.
5. Review/expand the synthetic seed data and evaluate an actual trained adapter.
   Larger models require separate memory checks; all-five local training has
   not been established. Do not overwrite existing Ollama models.

This is a hardware/software readiness assessment, not a completed training run.
