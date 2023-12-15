import io
import os
import time
from typing import Tuple
import paramiko


def exec_simple(
    client: paramiko.SSHClient, command: str, timeout=15, cmd_timeout=3600
) -> Tuple[str, str]:
    """Executes the given command on the paramiko client, waiting for
    the command to finish before returning the stdout and stderr
    """
    transport = client.get_transport()
    if transport is None:
        raise ValueError("Client is not connected")

    chan = transport.open_session(timeout=timeout)
    chan.settimeout(cmd_timeout)
    chan.exec_command(command)
    stdout = chan.makefile("r", 8192)
    stderr = chan.makefile_stderr("r", 8192)

    all_stdout = io.BytesIO()
    all_stderr = io.BytesIO()

    while not chan.exit_status_ready():
        time.sleep(0.1)

        from_stdout = stdout.read(4096)
        from_stderr = stderr.read(4096)

        if from_stdout is not None:
            all_stdout.write(from_stdout)

        if from_stderr is not None:
            all_stderr.write(from_stderr)

    while from_stdout := stdout.read(4096):
        all_stdout.write(from_stdout)

    while from_stderr := stderr.read(4096):
        all_stderr.write(from_stderr)

    return all_stdout.getvalue().decode(
        "utf-8", errors="replace"
    ), all_stderr.getvalue().decode("utf-8", errors="replace")


def write_echo_commands_for_folder(
    infile_path: str,
    echo_path: str,
    writer: io.StringIO,
) -> None:
    """Writes the appropriate commands to echo the local folder at infile_path
    to the remote folder at echo_path. Only supports text files.
    """
    writer.write(f"mkdir -p {echo_path.replace(os.path.sep, '/')}\n")
    for root, _, files in os.walk(infile_path):
        relative_root = os.path.relpath(root, infile_path)
        if relative_root != ".":
            writer.write(
                f"mkdir -p {os.path.join(echo_path, relative_root).replace(os.path.sep, '/')}\n"
            )

        for file in files:
            infile_filepath = os.path.join(root, file)
            echo_file_path = os.path.join(
                echo_path, relative_root if relative_root != "." else "", file
            )
            write_echo_commands_for_file(infile_filepath, echo_file_path, writer)


def write_echo_commands_for_file(
    infile_path: str,
    echo_file_path: str,
    writer: io.StringIO,
    mark_executable: bool = True,
) -> None:
    """Writes the appropriate commands to echo the local file at infile_path
    to the remote file at echo_file_path. Only supports text files.
    """
    echo_file_path = echo_file_path.replace(os.path.sep, "/")
    with open(infile_path, "r") as infile:
        for line in infile:
            cleaned_line = line.rstrip().replace("\\", "\\\\").replace("'", "\\'")
            writer.write(f"echo $'{cleaned_line}' >> {echo_file_path}\n")

    if mark_executable:
        writer.write(f"chmod +x {echo_file_path}\n")
    writer.write(f'echo "finished writing {echo_file_path}"\n')
    # print file size:
    writer.write(f"du -sh {echo_file_path}\n")
