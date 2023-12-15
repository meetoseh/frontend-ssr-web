import io
import os
import time
from typing import Tuple
import paramiko
from deployment.temp_files import temp_dir
from loguru import logger


def exec_simple(
    client: paramiko.SSHClient, command: str, timeout=15, cmd_timeout=3600
) -> Tuple[str, str]:
    """Executes the given command on the paramiko client, waiting for
    the command to finish before returning the stdout and stderr
    """
    logger.debug("Acquiring client transport...")
    transport = client.get_transport()
    if transport is None:
        raise ValueError("Client is not connected")

    logger.debug("Preparing command")

    with temp_dir() as logdir:
        command_path = os.path.join(logdir, "command.txt")
        stdout_path = os.path.join(logdir, "stdout.txt")
        stderr_path = os.path.join(logdir, "stderr.txt")

        logger.debug(
            f"executing command on remote; writing logs to {logdir} "
            " (cleaned up after)"
        )

        with open(command_path, "w") as command_file:
            command_file.write(command + "\n")

        logger.debug("wrote command locally, writing to channel...")

        with open(stdout_path, "wb") as stdout_file, open(
            stderr_path, "wb"
        ) as stderr_file:
            chan = transport.open_session(timeout=timeout)
            chan.settimeout(cmd_timeout)
            chan.exec_command(command)
            logger.debug("starting stdio loop...")

            started_at = time.time()
            last_printed_at = started_at

            stdout_closed = False
            stderr_closed = False
            made_progress_last_time = False
            need_flush = False

            while not chan.exit_status_ready():
                if time.time() - last_printed_at > 10:
                    logger.debug("command is still running...")
                    last_printed_at = time.time()

                if not made_progress_last_time:
                    if need_flush:
                        stdout_file.flush()
                        stderr_file.flush()
                        need_flush = False
                    time.sleep(0.1)
                else:
                    need_flush = True

                made_progress_last_time = False
                if not stdout_closed and chan.recv_ready():
                    made_progress_last_time = True
                    from_stdout = chan.recv(4096)
                    if from_stdout:
                        stdout_file.write(from_stdout)
                    else:
                        logger.debug("stdout closed")
                        stdout_closed = True

                if not stderr_closed and chan.recv_stderr_ready():
                    made_progress_last_time = True
                    from_stderr = chan.recv_stderr(4096)
                    if from_stderr:
                        stderr_file.write(from_stderr)
                    else:
                        logger.debug("stderr closed")
                        stderr_closed = True

            logger.debug("command executed, fetching last of stdout/stderr...")
            while not stdout_closed or not stderr_closed:
                if not made_progress_last_time:
                    time.sleep(0.1)

                made_progress_last_time = False
                if not stdout_closed and chan.recv_ready():
                    made_progress_last_time = True
                    from_stdout = chan.recv(4096)
                    if from_stdout:
                        stdout_file.write(from_stdout)
                    else:
                        logger.debug("stdout closed")
                        stdout_closed = True

                if not stderr_closed and chan.recv_stderr_ready():
                    made_progress_last_time = True
                    from_stderr = chan.recv_stderr(4096)
                    if from_stderr:
                        stderr_file.write(from_stderr)
                    else:
                        logger.debug("stderr closed")
                        stderr_closed = True

        logger.debug("command finished, reading logs...")

        with open(stdout_path, "rb") as stdout_file:
            all_stdout = stdout_file.read()

        with open(stderr_path, "rb") as stderr_file:
            all_stderr = stderr_file.read()

        logger.debug("logs read, returning...")

        return all_stdout.decode("utf-8", errors="replace"), all_stderr.decode(
            "utf-8", errors="replace"
        )


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
