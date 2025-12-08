from frontend import demo
from logic import initialize_rag

if __name__ == "__main__":
  result = initialize_rag('./system_data')
  print(f"RAG init result: {result}")

  demo.queue()
  demo.launch(
    server_name="127.0.0.1",   # avoid the localhost proxy check
    server_port=7862,
    show_api=False              # <- prevents the schema path that crashes
  )
print("WE'RE LIVE")